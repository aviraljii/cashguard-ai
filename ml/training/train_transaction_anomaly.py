"""Train and report CashGuard's unsupervised bank-transaction anomaly model."""

from __future__ import annotations

import json
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import IsolationForest
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler


ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from ml.src.data.mysql_loader import load_query  # noqa: E402
from ml.src.features.transaction_anomaly_dataset import (  # noqa: E402
    CATEGORICAL_FEATURE_COLUMNS, FEATURE_COLUMNS, NUMERIC_FEATURE_COLUMNS,
    load_transaction_features, prepare_model_features,
)
from ml.src.prediction.transaction_anomaly_predictor import TransactionAnomalyPredictor  # noqa: E402


MODEL_DIR = ROOT / "ml" / "models"
EVALUATION_DIR = ROOT / "ml" / "evaluation" / "transaction_anomaly"
MODEL_PATH = MODEL_DIR / "transaction_anomaly_model.joblib"
METADATA_PATH = MODEL_DIR / "transaction_anomaly_metadata.json"
REPORT_PATH = EVALUATION_DIR / "transaction_anomaly_evaluation.json"
QUALITY_PATH = EVALUATION_DIR / "transaction_anomaly_data_quality.json"
CONTAMINATION = 0.03
RANDOM_SEED = 42


def source_diagnostics() -> dict[str, Any]:
    row = load_query("""
        SELECT COUNT(*) AS row_count, MIN(transaction_date) AS min_date, MAX(transaction_date) AS max_date,
               SUM(transaction_date > CURDATE()) AS future_dated_rows, SUM(amount IS NULL) AS null_amount_rows,
               SUM(amount <= 0) AS non_positive_amount_rows, COUNT(*) - COUNT(DISTINCT id) AS duplicate_id_rows,
               MIN(amount) AS min_amount, MAX(amount) AS max_amount, AVG(amount) AS average_amount
        FROM bank_transactions
    """).iloc[0]
    category_rows = load_query("SELECT transaction_type, category, COUNT(*) AS transaction_count FROM bank_transactions GROUP BY transaction_type, category ORDER BY transaction_type, category")
    return {
        "row_count": int(row["row_count"]), "date_range": [str(row["min_date"]), str(row["max_date"])],
        "future_dated_rows": int(row["future_dated_rows"] or 0), "null_amount_rows": int(row["null_amount_rows"] or 0),
        "non_positive_amount_rows": int(row["non_positive_amount_rows"] or 0), "duplicate_id_rows": int(row["duplicate_id_rows"] or 0),
        "min_amount": float(row["min_amount"]), "max_amount": float(row["max_amount"]), "average_amount": round(float(row["average_amount"]), 2),
        "transaction_type_category_counts": category_rows.to_dict(orient="records"),
    }


def validate_data(raw: pd.DataFrame, prepared: pd.DataFrame) -> dict[str, Any]:
    diagnostics = source_diagnostics()
    return {
        "source_diagnostics": diagnostics,
        "scorable_rows": int(len(raw)),
        "scoring_date_range": [raw["transaction_date"].min().date().isoformat(), raw["transaction_date"].max().date().isoformat()],
        "duplicate_transaction_ids_in_dataset": int(raw["transaction_id"].duplicated().sum()),
        "null_values_in_required_model_features": int(prepared[list(FEATURE_COLUMNS)].isna().sum().sum()),
        "future_dates_in_dataset": int((raw["transaction_date"] > pd.Timestamp.now().normalize()).sum()),
        "leakage_control": "All rolling category/type statistics use only the preceding 30 calendar days; current-day and future transactions are excluded.",
    }


def build_model() -> Pipeline:
    preprocessing = ColumnTransformer(
        transformers=[
            ("numeric", Pipeline([("imputer", SimpleImputer(strategy="median")), ("scaler", StandardScaler())]), list(NUMERIC_FEATURE_COLUMNS)),
            ("categorical", OneHotEncoder(handle_unknown="ignore"), list(CATEGORICAL_FEATURE_COLUMNS)),
        ]
    )
    return Pipeline([
        ("preprocessing", preprocessing),
        ("model", IsolationForest(n_estimators=300, contamination=CONTAMINATION, random_state=RANDOM_SEED, n_jobs=1)),
    ])


def rule_baseline(data: pd.DataFrame) -> pd.Series:
    """Obvious prior-history amount outliers; never treated as ground-truth labels."""
    enough_history = data["historical_transaction_count_30d"].fillna(0) >= 10
    return enough_history & (data["transaction_amount_zscore"].abs() >= 3)


def _score_summary(scores: np.ndarray) -> dict[str, float]:
    return {name: round(float(np.quantile(scores, quantile)), 6) for name, quantile in (("min", 0), ("p50", .50), ("p80", .80), ("p90", .90), ("p97", .97), ("max", 1))}


def train(business_id: str | None = None) -> dict[str, Any]:
    """Fit on an earlier chronological period, inspect a later scoring period, then persist a current model."""
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    EVALUATION_DIR.mkdir(parents=True, exist_ok=True)
    raw = load_transaction_features(business_id)
    prepared = prepare_model_features(raw)
    quality = validate_data(raw, prepared)
    if any((quality["duplicate_transaction_ids_in_dataset"], quality["null_values_in_required_model_features"], quality["future_dates_in_dataset"], quality["source_diagnostics"]["null_amount_rows"], quality["source_diagnostics"]["non_positive_amount_rows"], quality["source_diagnostics"]["duplicate_id_rows"])):
        raise ValueError(f"Transaction anomaly data-quality checks failed: {quality}")
    QUALITY_PATH.write_text(json.dumps(quality, indent=2), encoding="utf-8")

    split_index = int(len(prepared) * .80)
    training, scoring = prepared.iloc[:split_index].copy(), prepared.iloc[split_index:].copy()
    validation_model = build_model()
    validation_model.fit(training[list(FEATURE_COLUMNS)])
    scoring_scores = -validation_model.score_samples(scoring[list(FEATURE_COLUMNS)])
    scoring_threshold = float(-validation_model.named_steps["model"].offset_)
    scoring_is_anomaly = scoring_scores >= scoring_threshold
    baseline_flags = rule_baseline(raw.iloc[split_index:])

    final_model = build_model()
    final_model.fit(prepared[list(FEATURE_COLUMNS)])
    all_scores = -final_model.score_samples(prepared[list(FEATURE_COLUMNS)])
    final_threshold = float(-final_model.named_steps["model"].offset_)
    risk_thresholds = {"low": float(np.quantile(all_scores, .80)), "medium": float(np.quantile(all_scores, .90)), "high": final_threshold}
    all_anomalies = prepared.loc[all_scores >= final_threshold].copy()
    all_anomalies["anomaly_score"] = all_scores[all_scores >= final_threshold]
    top_anomalies = all_anomalies.sort_values("anomaly_score", ascending=False).head(10)[[
        "transaction_id", "transaction_date", "transaction_type", "category", "amount",
        "anomaly_score", "transaction_amount_relative_to_history", "transaction_amount_zscore",
        "historical_transaction_count_30d",
    ]].replace({np.nan: None}).to_dict(orient="records")
    joblib.dump(final_model, MODEL_PATH)
    business = str(raw["business_id"].iloc[0])
    metadata = {
        "model_version": "1.0", "source_table": "bank_transactions", "model_type": "IsolationForest",
        "feature_columns": list(FEATURE_COLUMNS), "contamination": CONTAMINATION,
        "anomaly_score_definition": "Negative Isolation Forest score_samples; larger values are more anomalous and are not probabilities.",
        "anomaly_score_threshold": final_threshold, "risk_score_thresholds": risk_thresholds,
        "feature_preprocessing": "Log amount; median-imputed/standardized numeric features; one-hot category and transaction type; early-history values represented by history_available_30d.",
        "business_id": business,
        "training_date_range": [training["transaction_date"].min().date().isoformat(), training["transaction_date"].max().date().isoformat()],
        "scoring_date_range": [scoring["transaction_date"].min().date().isoformat(), scoring["transaction_date"].max().date().isoformat()],
        "production_model_fit_date_range": [prepared["transaction_date"].min().date().isoformat(), prepared["transaction_date"].max().date().isoformat()],
        "trained_at_utc": datetime.now(UTC).isoformat(),
    }
    METADATA_PATH.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    predictor = TransactionAnomalyPredictor(MODEL_PATH, METADATA_PATH)
    result = {
        "data_quality": quality,
        "baseline_rule": "Flag transactions with at least 10 prior category/direction transactions and |30-day historical amount z-score| >= 3.",
        "baseline_rule_anomaly_count_in_scoring_period": int(baseline_flags.sum()),
        "training_rows": int(len(training)), "scoring_rows": int(len(scoring)),
        "scoring_period_isolation_forest_anomaly_count": int(scoring_is_anomaly.sum()),
        "scoring_period_isolation_forest_anomaly_percentage": round(float(scoring_is_anomaly.mean() * 100), 2),
        "scoring_period_score_distribution": _score_summary(scoring_scores),
        "production_anomaly_count": int(len(all_anomalies)),
        "production_anomaly_percentage": round(float(len(all_anomalies) / len(prepared) * 100), 2),
        "production_score_distribution": _score_summary(all_scores), "top_anomalies": top_anomalies,
        "example_prediction": predictor.predict(str(all_anomalies.iloc[0]["transaction_id"])),
    }
    REPORT_PATH.write_text(json.dumps(result, indent=2, default=str), encoding="utf-8")
    return result


if __name__ == "__main__":
    print(json.dumps(train(), indent=2, default=str))
