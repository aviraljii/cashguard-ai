from __future__ import annotations

from pathlib import Path

import joblib
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split
from sqlalchemy import select
from sqlalchemy.orm import Session

from auth_service.database import SessionLocal

from payment_service.models import Payment


# ------------------------------------------------------------------
# PATHS
# ------------------------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent

MODEL_DIR = BASE_DIR / "models"

MODEL_PATH = MODEL_DIR / "risk_model.joblib"


# ------------------------------------------------------------------
# FEATURE COLUMNS
# ------------------------------------------------------------------

FEATURE_COLUMNS = [
    "payment_amount",
    "average_previous_payment_amount",
    "previous_payment_count",
    "previous_failed_payment_count",
    "previous_failed_payment_ratio",
]


# ------------------------------------------------------------------
# MINIMUM DATASET SIZE
# ------------------------------------------------------------------

MINIMUM_TOTAL_SAMPLES = 20
MINIMUM_SAMPLES_PER_CLASS = 5


# ------------------------------------------------------------------
# BUILD FEATURES FOR PAYMENT
# ------------------------------------------------------------------

def build_training_features(
    db: Session,
    payment: Payment,
) -> dict[str, float] | None:
    """
    Build point-in-time historical features for one payment.

    Only payments created BEFORE the current payment are used.
    This prevents future-data leakage during training.
    """

    previous_payments = db.scalars(
        select(Payment)
        .where(
            Payment.user_id == payment.user_id,
            Payment.created_at < payment.created_at,
        )
        .order_by(
            Payment.created_at.asc()
        )
    ).all()

    payment_amount = float(
        payment.amount
    )

    previous_payment_count = len(
        previous_payments
    )

    previous_failed_payment_count = sum(
        1
        for item in previous_payments
        if item.status == "failed"
    )

    previous_completed_payments = [
        item
        for item in previous_payments
        if item.status == "completed"
    ]

    if previous_completed_payments:
        average_previous_payment_amount = (
            sum(
                float(item.amount)
                for item in previous_completed_payments
            )
            / len(
                previous_completed_payments
            )
        )
    else:
        average_previous_payment_amount = 0.0

    previous_failed_payment_ratio = 0.0

    if previous_payment_count > 0:
        previous_failed_payment_ratio = (
            previous_failed_payment_count
            / previous_payment_count
        )

    return {
        "payment_amount": payment_amount,
        "average_previous_payment_amount": (
            average_previous_payment_amount
        ),
        "previous_payment_count": float(
            previous_payment_count
        ),
        "previous_failed_payment_count": float(
            previous_failed_payment_count
        ),
        "previous_failed_payment_ratio": float(
            previous_failed_payment_ratio
        ),
    }


# ------------------------------------------------------------------
# LOAD DATASET
# ------------------------------------------------------------------

def load_training_dataset(
    db: Session,
) -> pd.DataFrame:
    """
    Build supervised training data from persisted payments.

    Target:
        failed payment   -> 1
        completed payment -> 0
    """

    payments = db.scalars(
        select(Payment)
        .where(
            Payment.status.in_(
                ["completed", "failed"]
            )
        )
        .order_by(
            Payment.created_at.asc()
        )
    ).all()

    rows: list[dict[str, float | int]] = []

    for payment in payments:
        features = build_training_features(
            db,
            payment,
        )

        if features is None:
            continue

        rows.append(
            {
                **features,
                "target": (
                    1
                    if payment.status == "failed"
                    else 0
                ),
            }
        )

    return pd.DataFrame(
        rows
    )


# ------------------------------------------------------------------
# VALIDATE DATASET
# ------------------------------------------------------------------

def validate_training_dataset(
    dataframe: pd.DataFrame,
) -> None:
    if dataframe.empty:
        raise RuntimeError(
            "No completed/failed payment history is available "
            "for ML training."
        )

    if len(dataframe) < MINIMUM_TOTAL_SAMPLES:
        raise RuntimeError(
            f"At least {MINIMUM_TOTAL_SAMPLES} labeled payments "
            "are required for training."
        )

    class_counts = (
        dataframe["target"]
        .value_counts()
    )

    for target_value in [0, 1]:
        count = int(
            class_counts.get(
                target_value,
                0,
            )
        )

        if count < MINIMUM_SAMPLES_PER_CLASS:
            label = (
                "completed"
                if target_value == 0
                else "failed"
            )

            raise RuntimeError(
                f"At least {MINIMUM_SAMPLES_PER_CLASS} "
                f"{label} payments are required. "
                f"Currently available: {count}."
            )


# ------------------------------------------------------------------
# TRAIN MODEL
# ------------------------------------------------------------------

def train_model(
    dataframe: pd.DataFrame,
) -> dict[str, float | str]:
    """
    Train a logistic regression classifier.
    """

    validate_training_dataset(
        dataframe
    )

    x = dataframe[
        FEATURE_COLUMNS
    ]

    y = dataframe[
        "target"
    ]

    x_train, x_test, y_train, y_test = (
        train_test_split(
            x,
            y,
            test_size=0.2,
            random_state=42,
            stratify=y,
        )
    )

    model = LogisticRegression(
        max_iter=1000,
        class_weight="balanced",
        random_state=42,
    )

    model.fit(
        x_train,
        y_train,
    )

    predictions = model.predict(
        x_test
    )

    probabilities = model.predict_proba(
        x_test
    )[:, 1]

    accuracy = accuracy_score(
        y_test,
        predictions,
    )

    auc = roc_auc_score(
        y_test,
        probabilities,
    )

    print(
        "\nClassification Report:\n"
    )

    print(
        classification_report(
            y_test,
            predictions,
            target_names=[
                "completed",
                "failed",
            ],
        )
    )

    MODEL_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    joblib.dump(
        model,
        MODEL_PATH,
    )

    return {
        "model_version": "ml-payment-failure-v1",
        "accuracy": round(
            float(accuracy),
            4,
        ),
        "roc_auc": round(
            float(auc),
            4,
        ),
        "training_samples": int(
            len(x_train)
        ),
        "test_samples": int(
            len(x_test)
        ),
        "model_path": str(
            MODEL_PATH
        ),
    }


# ------------------------------------------------------------------
# MAIN TRAINING ENTRY POINT
# ------------------------------------------------------------------

def main() -> None:
    db = SessionLocal()

    try:
        dataframe = load_training_dataset(
            db
        )

        print(
            f"Training dataset rows: {len(dataframe)}"
        )

        result = train_model(
            dataframe
        )

        print(
            "\nML model trained successfully."
        )

        for key, value in result.items():
            print(
                f"{key}: {value}"
            )

    finally:
        db.close()


if __name__ == "__main__":
    main()