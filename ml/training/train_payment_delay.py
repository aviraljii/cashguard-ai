"""Train and persist CashGuard's customer payment-delay risk model."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from xgboost import XGBClassifier


# ============================================================
# PROJECT PATHS
# ============================================================

ROOT = Path(__file__).resolve().parents[2]

if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


from ml.src.data.validation import validate_dataset  # noqa: E402
from ml.src.features.payment_delay_dataset import (  # noqa: E402
    FEATURE_COLUMNS,
    TARGET,
    load_historical_dataset,
)
from ml.src.prediction.payment_delay_predictor import (  # noqa: E402
    PaymentDelayPredictor,
)


# ============================================================
# CONFIGURATION
# ============================================================

RANDOM_SEED = 42

MODEL_DIR = ROOT / "ml" / "models"
EVALUATION_DIR = ROOT / "ml" / "evaluation"
PROCESSED_DIR = ROOT / "ml" / "data" / "processed"

MODEL_PATH = MODEL_DIR / "payment_delay_risk_model.joblib"
METADATA_PATH = MODEL_DIR / "payment_delay_model_metadata.json"
EVALUATION_PATH = EVALUATION_DIR / "payment_delay_evaluation.json"
DATASET_PATH = PROCESSED_DIR / "payment_delay_historical_dataset.csv"
QUALITY_REPORT_PATH = PROCESSED_DIR / "payment_delay_data_quality_report.json"


# ============================================================
# DIRECTORY SETUP
# ============================================================

def create_directories() -> None:
    """Create required project directories."""

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    EVALUATION_DIR.mkdir(parents=True, exist_ok=True)
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)


# ============================================================
# DATA VALIDATION
# ============================================================

def validate_training_data(data: pd.DataFrame) -> None:
    """Perform safety checks before model training."""

    if data.empty:
        raise ValueError("Training dataset is empty.")

    required_columns = set(FEATURE_COLUMNS) | {TARGET}

    missing_columns = required_columns.difference(data.columns)

    if missing_columns:
        raise ValueError(
            f"Missing required columns: {sorted(missing_columns)}"
        )

    if data[TARGET].isna().any():
        raise ValueError(
            f"Target column '{TARGET}' contains missing values."
        )

    unique_targets = data[TARGET].dropna().unique()

    if len(unique_targets) < 2:
        raise ValueError(
            f"Target column '{TARGET}' must contain at least two classes. "
            f"Found: {unique_targets.tolist()}"
        )


# ============================================================
# TEMPORAL SPLIT
# ============================================================

def temporal_split(
    data: pd.DataFrame,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    Split data chronologically.

    This prevents future information from leaking into training.
    """

    sort_columns = []

    if "as_of_date" in data.columns:
        sort_columns.append("as_of_date")

    if "invoice_id" in data.columns:
        sort_columns.append("invoice_id")

    if not sort_columns:
        raise ValueError(
            "Dataset must contain 'as_of_date' or 'invoice_id' "
            "for deterministic temporal ordering."
        )

    ordered = data.sort_values(sort_columns).reset_index(drop=True)

    if len(ordered) < 10:
        raise ValueError(
            f"Dataset is too small for reliable training: {len(ordered)} rows."
        )

    boundary = int(len(ordered) * 0.8)

    boundary = max(1, min(boundary, len(ordered) - 1))

    train_data = ordered.iloc[:boundary].copy()
    test_data = ordered.iloc[boundary:].copy()

    if train_data[TARGET].nunique() < 2:
        raise ValueError(
            "Training split does not contain both target classes."
        )

    if test_data[TARGET].nunique() < 2:
        raise ValueError(
            "Test split does not contain both target classes."
        )

    return train_data, test_data


# ============================================================
# MODEL EVALUATION
# ============================================================

def evaluate(
    model: Pipeline,
    x_test: pd.DataFrame,
    y_test: pd.Series,
) -> dict[str, Any]:
    """Evaluate a trained model."""

    predictions = model.predict(x_test)
    probabilities = model.predict_proba(x_test)[:, 1]

    return {
        "accuracy": round(
            float(accuracy_score(y_test, predictions)), 4
        ),
        "precision": round(
            float(
                precision_score(
                    y_test,
                    predictions,
                    zero_division=0,
                )
            ),
            4,
        ),
        "recall": round(
            float(
                recall_score(
                    y_test,
                    predictions,
                    zero_division=0,
                )
            ),
            4,
        ),
        "f1": round(
            float(
                f1_score(
                    y_test,
                    predictions,
                    zero_division=0,
                )
            ),
            4,
        ),
        "roc_auc": round(
            float(
                roc_auc_score(
                    y_test,
                    probabilities,
                )
            ),
            4,
        ),
        "confusion_matrix": confusion_matrix(
            y_test,
            predictions,
        ).tolist(),
    }


# ============================================================
# FEATURE IMPORTANCE
# ============================================================

def feature_importance(
    model: Pipeline,
    feature_names: tuple[str, ...],
) -> list[dict[str, float | str]]:
    """Extract model feature importance."""

    estimator = model.named_steps["model"]

    if hasattr(estimator, "feature_importances_"):
        weights = estimator.feature_importances_

    elif hasattr(estimator, "coef_"):
        weights = np.abs(estimator.coef_[0])

    else:
        return []

    result = []

    for name, weight in zip(feature_names, weights):
        result.append(
            {
                "feature": name,
                "importance": round(float(weight), 6),
            }
        )

    result.sort(
        key=lambda item: float(item["importance"]),
        reverse=True,
    )

    return result


# ============================================================
# MODEL BUILDERS
# ============================================================

def build_logistic_regression() -> Pipeline:
    """Build baseline Logistic Regression pipeline."""

    numeric_preprocessor = ColumnTransformer(
        transformers=[
            (
                "numeric",
                Pipeline(
                    steps=[
                        (
                            "imputer",
                            SimpleImputer(strategy="median"),
                        ),
                        (
                            "scaler",
                            StandardScaler(),
                        ),
                    ]
                ),
                list(FEATURE_COLUMNS),
            )
        ]
    )

    return Pipeline(
        steps=[
            (
                "preprocess",
                numeric_preprocessor,
            ),
            (
                "model",
                LogisticRegression(
                    max_iter=2000,
                    class_weight="balanced",
                    random_state=RANDOM_SEED,
                ),
            ),
        ]
    )


def build_xgboost(positive_weight: float) -> Pipeline:
    """Build XGBoost pipeline."""

    numeric_preprocessor = ColumnTransformer(
        transformers=[
            (
                "numeric",
                SimpleImputer(strategy="median"),
                list(FEATURE_COLUMNS),
            )
        ]
    )

    model = XGBClassifier(
        n_estimators=75,
        max_depth=3,
        learning_rate=0.05,
        subsample=0.9,
        colsample_bytree=0.9,
        eval_metric="logloss",
        random_state=RANDOM_SEED,
        scale_pos_weight=positive_weight,
        n_jobs=1,
        tree_method="hist",
        verbosity=0,
    )

    return Pipeline(
        steps=[
            (
                "preprocess",
                numeric_preprocessor,
            ),
            (
                "model",
                model,
            ),
        ]
    )


# ============================================================
# TRAINING
# ============================================================

def train() -> dict[str, Any]:
    """Train, evaluate and persist the best payment-delay model."""

    print("=" * 70)
    print("CashGuard AI - Payment Delay Model Training")
    print("=" * 70)

    create_directories()

    print("\n[1/8] Loading historical dataset...")

    data = load_historical_dataset()

    print(f"Loaded {len(data)} rows.")

    print("\n[2/8] Validating training data...")

    validate_training_data(data)

    report = validate_dataset(
        data,
        TARGET,
        QUALITY_REPORT_PATH,
    )

    data.to_csv(
        DATASET_PATH,
        index=False,
    )

    print("Dataset validation completed.")

    print("\n[3/8] Creating temporal train/test split...")

    train_data, test_data = temporal_split(data)

    print(f"Training rows: {len(train_data)}")
    print(f"Testing rows : {len(test_data)}")

    x_train = train_data[list(FEATURE_COLUMNS)]
    y_train = train_data[TARGET]

    x_test = test_data[list(FEATURE_COLUMNS)]
    y_test = test_data[TARGET]

    print("\n[4/8] Calculating class imbalance...")

    negative_count = int((y_train == 0).sum())
    positive_count = int((y_train == 1).sum())

    if positive_count == 0:
        raise ValueError(
            "Training dataset contains no positive target examples."
        )

    positive_weight = negative_count / positive_count

    print(f"Class 0: {negative_count}")
    print(f"Class 1: {positive_count}")
    print(f"Positive class weight: {positive_weight:.4f}")

    print("\n[5/8] Building models...")

    models: dict[str, Pipeline] = {
        "logistic_regression": build_logistic_regression(),
        "xgboost": build_xgboost(positive_weight),
    }

    evaluations: dict[str, dict[str, Any]] = {}

    print("\n[6/8] Training and evaluating models...")

    for name, model in models.items():

        print(f"\nTraining: {name}")

        model.fit(
            x_train,
            y_train,
        )

        metrics = evaluate(
            model,
            x_test,
            y_test,
        )

        evaluations[name] = metrics

        print(
            json.dumps(
                metrics,
                indent=2,
            )
        )

    print("\n[7/8] Selecting best model...")

    selected_name = max(
        evaluations,
        key=lambda name: (
            evaluations[name]["roc_auc"],
            evaluations[name]["f1"],
        ),
    )

    selected_model = models[selected_name]

    print(f"Selected model: {selected_name}")

    # --------------------------------------------------------
    # Save model
    # --------------------------------------------------------

    joblib.dump(
        selected_model,
        MODEL_PATH,
    )

    print(f"Model saved: {MODEL_PATH}")

    importance = feature_importance(
        selected_model,
        FEATURE_COLUMNS,
    )

    metadata = {
        "target": TARGET,
        "feature_columns": list(FEATURE_COLUMNS),
        "selected_model": selected_name,
        "random_seed": RANDOM_SEED,
        "feature_importance": importance,
        "target_definition": (
            "1 when the invoice's final observed payment date "
            "is after its due date."
        ),
    }

    METADATA_PATH.write_text(
        json.dumps(
            metadata,
            indent=2,
        ),
        encoding="utf-8",
    )

    # --------------------------------------------------------
    # Prediction verification
    # --------------------------------------------------------

    sample_features = (
        test_data.iloc[0][list(FEATURE_COLUMNS)]
        .to_dict()
    )

    predictor = PaymentDelayPredictor(
        MODEL_PATH,
        METADATA_PATH,
    )

    prediction = predictor.predict(
        sample_features
    )

    result = {
        "dataset": {
            "rows": len(data),
            "columns": data.shape[1],
            "target_distribution": report.get(
                "target_distribution",
                {},
            ),
            "train_rows": len(train_data),
            "test_rows": len(test_data),
        },
        "evaluations": evaluations,
        "selected_model": selected_name,
        "feature_importance": importance,
        "prediction_example": {
            "customer_id": str(
                test_data.iloc[0]["customer_id"]
            )
            if "customer_id" in test_data.columns
            else None,
            **prediction,
        },
    }

    EVALUATION_PATH.write_text(
        json.dumps(
            result,
            indent=2,
        ),
        encoding="utf-8",
    )

    print("\n[8/8] Training completed successfully!")

    print("\nGenerated files:")
    print(f"  Model      : {MODEL_PATH}")
    print(f"  Metadata   : {METADATA_PATH}")
    print(f"  Evaluation : {EVALUATION_PATH}")
    print(f"  Dataset    : {DATASET_PATH}")
    print(f"  Quality    : {QUALITY_REPORT_PATH}")

    print("\nFinal result:")
    print(
        json.dumps(
            result,
            indent=2,
        )
    )

    return result


# ============================================================
# ENTRY POINT
# ============================================================

if __name__ == "__main__":
    train()