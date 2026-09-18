"""Train and evaluate CashGuard's point-in-time customer churn models."""

from __future__ import annotations

import json
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import joblib
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score, precision_score, recall_score, roc_auc_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from xgboost import XGBClassifier


ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from ml.src.features.customer_churn_dataset import FEATURE_COLUMNS, TARGET, load_historical_churn_dataset  # noqa: E402
from ml.src.prediction.customer_churn_predictor import CustomerChurnPredictor  # noqa: E402


MODEL_DIR = ROOT / "ml" / "models"
EVALUATION_DIR = ROOT / "ml" / "evaluation" / "customer_churn"
PROCESSED_DIR = ROOT / "ml" / "data" / "processed"
MODEL_PATH = MODEL_DIR / "customer_churn_model.joblib"
METADATA_PATH = MODEL_DIR / "customer_churn_metadata.json"
EVALUATION_PATH = EVALUATION_DIR / "customer_churn_evaluation.json"
DATASET_PATH = PROCESSED_DIR / "customer_churn_snapshots.csv"
RANDOM_SEED = 42


def chronological_split(data: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Split entire snapshot dates 60/20/20 so a date never spans datasets."""
    dates = sorted(pd.to_datetime(data["snapshot_date"]).unique())
    if len(dates) < 10:
        raise ValueError("At least 10 distinct snapshot dates are required.")
    train_end, validation_end = int(len(dates) * .60), int(len(dates) * .80)
    train = data.loc[data["snapshot_date"].isin(dates[:train_end])].copy()
    validation = data.loc[data["snapshot_date"].isin(dates[train_end:validation_end])].copy()
    test = data.loc[data["snapshot_date"].isin(dates[validation_end:])].copy()
    for name, split in (("train", train), ("validation", validation), ("test", test)):
        if split.empty or split[TARGET].nunique() < 2:
            raise ValueError(f"The {name} chronological split does not contain both churn classes.")
    return train, validation, test


def build_logistic() -> Pipeline:
    return Pipeline([
        ("preprocess", ColumnTransformer([("numeric", Pipeline([("imputer", SimpleImputer(strategy="median")), ("scaler", StandardScaler())]), list(FEATURE_COLUMNS))])),
        ("model", LogisticRegression(max_iter=2000, class_weight="balanced", random_state=RANDOM_SEED)),
    ])


def build_xgboost(positive_weight: float) -> Pipeline:
    return Pipeline([
        ("preprocess", ColumnTransformer([("numeric", SimpleImputer(strategy="median"), list(FEATURE_COLUMNS))])),
        ("model", XGBClassifier(n_estimators=200, max_depth=3, learning_rate=.03, subsample=.9, colsample_bytree=.9,
            eval_metric="logloss", random_state=RANDOM_SEED, scale_pos_weight=positive_weight, n_jobs=1, tree_method="hist", verbosity=0)),
    ])


def evaluate(model: Pipeline, data: pd.DataFrame) -> dict[str, Any]:
    features, actual = data[list(FEATURE_COLUMNS)], data[TARGET]
    predicted = model.predict(features)
    probabilities = model.predict_proba(features)[:, 1]
    return {
        "accuracy": round(float(accuracy_score(actual, predicted)), 4),
        "precision": round(float(precision_score(actual, predicted, zero_division=0)), 4),
        "recall": round(float(recall_score(actual, predicted, zero_division=0)), 4),
        "f1": round(float(f1_score(actual, predicted, zero_division=0)), 4),
        "roc_auc": round(float(roc_auc_score(actual, probabilities)), 4),
        "confusion_matrix": confusion_matrix(actual, predicted).tolist(),
        "churn_rate": round(float(actual.mean() * 100), 2), "rows": int(len(data)),
    }


def validate(data: pd.DataFrame) -> dict[str, Any]:
    return {
        "rows": int(len(data)), "snapshot_date_range": [data["snapshot_date"].min().date().isoformat(), data["snapshot_date"].max().date().isoformat()],
        "distinct_snapshot_dates": int(data["snapshot_date"].nunique()), "duplicate_customer_snapshot_rows": int(data.duplicated(["customer_id", "snapshot_date"]).sum()),
        "null_values_in_features": int(data[list(FEATURE_COLUMNS)].isna().sum().sum()),
        "future_snapshot_rows": int((data["snapshot_date"] + pd.Timedelta(days=90) > pd.Timestamp.now().normalize()).sum()),
        "target_rate": round(float(data[TARGET].mean() * 100), 2),
        "leakage_control": "Features use sales on/before snapshot_date; churn target checks only the strictly following 90 days; incomplete windows are excluded.",
    }


def train() -> dict[str, Any]:
    for directory in (MODEL_DIR, EVALUATION_DIR, PROCESSED_DIR):
        directory.mkdir(parents=True, exist_ok=True)
    data = load_historical_churn_dataset()
    quality = validate(data)
    if any((quality["duplicate_customer_snapshot_rows"], quality["null_values_in_features"], quality["future_snapshot_rows"])) or data[TARGET].nunique() < 2:
        raise ValueError(f"Customer churn data-quality checks failed: {quality}")
    data.to_csv(DATASET_PATH, index=False)
    train_data, validation_data, test_data = chronological_split(data)
    positive_weight = float((train_data[TARGET] == 0).sum() / (train_data[TARGET] == 1).sum())
    candidates = {"logistic_regression": build_logistic(), "xgboost": build_xgboost(positive_weight)}
    evaluations: dict[str, dict[str, Any]] = {}
    for name, model in candidates.items():
        model.fit(train_data[list(FEATURE_COLUMNS)], train_data[TARGET])
        evaluations[name] = {"validation": evaluate(model, validation_data), "test": evaluate(model, test_data)}
    selected_name = max(evaluations, key=lambda name: (evaluations[name]["validation"]["roc_auc"], evaluations[name]["validation"]["recall"]))
    selected_model = build_logistic() if selected_name == "logistic_regression" else build_xgboost(float(((pd.concat([train_data, validation_data])[TARGET] == 0).sum()) / ((pd.concat([train_data, validation_data])[TARGET] == 1).sum())))
    fit_data = pd.concat([train_data, validation_data], ignore_index=True)
    selected_model.fit(fit_data[list(FEATURE_COLUMNS)], fit_data[TARGET])
    joblib.dump(selected_model, MODEL_PATH)
    metadata = {
        "model_version": "1.0", "selected_model": selected_name, "feature_columns": list(FEATURE_COLUMNS), "target_column": TARGET,
        "target_definition": "1 when a customer has no completed sale strictly after the snapshot through the next 90 days.",
        "observation_window_days": 90, "risk_mapping": {"Low": "probability < 0.34", "Medium": "0.34 <= probability < 0.67", "High": "probability >= 0.67"},
        "probability_note": "Model predict_proba output; no calibration has been performed.",
        "training_date_range": [train_data["snapshot_date"].min().date().isoformat(), train_data["snapshot_date"].max().date().isoformat()],
        "validation_date_range": [validation_data["snapshot_date"].min().date().isoformat(), validation_data["snapshot_date"].max().date().isoformat()],
        "test_date_range": [test_data["snapshot_date"].min().date().isoformat(), test_data["snapshot_date"].max().date().isoformat()],
        "evaluation_metrics": evaluations, "trained_at_utc": datetime.now(UTC).isoformat(),
    }
    METADATA_PATH.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    sample_customer_id = str(test_data.iloc[0]["customer_id"])
    predictor = CustomerChurnPredictor(MODEL_PATH, METADATA_PATH)
    result = {"data_quality": quality, "split_rows": {"train": len(train_data), "validation": len(validation_data), "test": len(test_data)}, "churn_rates": {"train": round(float(train_data[TARGET].mean() * 100), 2), "validation": round(float(validation_data[TARGET].mean() * 100), 2), "test": round(float(test_data[TARGET].mean() * 100), 2)}, "evaluations": evaluations, "selected_model": selected_name, "prediction_example": predictor.predict(sample_customer_id)}
    EVALUATION_PATH.write_text(json.dumps(result, indent=2), encoding="utf-8")
    return result


if __name__ == "__main__":
    print(json.dumps(train(), indent=2))
