"""Train, evaluate, and persist CashGuard's daily cash-flow forecast model."""

from __future__ import annotations

import json
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.impute import SimpleImputer
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.pipeline import Pipeline
from xgboost import XGBRegressor


ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from ml.src.features.cash_flow_dataset import (  # noqa: E402
    FEATURE_COLUMNS,
    TARGET,
    build_feature_frame,
    load_daily_cash_flow,
)
from ml.src.prediction.cash_flow_predictor import CashFlowPredictor  # noqa: E402


MODEL_DIR = ROOT / "ml" / "models"
EVALUATION_DIR = ROOT / "ml" / "evaluation" / "cash_flow"
PROCESSED_DIR = ROOT / "ml" / "data" / "processed"
MODEL_PATH = MODEL_DIR / "cash_flow_forecast_model.joblib"
METADATA_PATH = MODEL_DIR / "cash_flow_forecast_metadata.json"
EVALUATION_PATH = EVALUATION_DIR / "cash_flow_evaluation.json"
QUALITY_PATH = EVALUATION_DIR / "cash_flow_data_quality.json"
DATASET_PATH = PROCESSED_DIR / "daily_cash_flow_features.csv"
RANDOM_SEED = 42


class SeasonalNaiveRegressor:
    """Serializable seven-day seasonal-naive model using the supplied lag feature."""

    def fit(self, features: pd.DataFrame, target: pd.Series) -> "SeasonalNaiveRegressor":
        return self

    def predict(self, features: pd.DataFrame) -> np.ndarray:
        return features["net_cash_flow_lag_7"].to_numpy(dtype=float)


def chronological_split(data: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Split 60/20/20 by date; never randomly shuffle time-series observations."""
    ordered = data.sort_values("date").reset_index(drop=True)
    if len(ordered) < 90:
        raise ValueError("At least 90 feature-ready daily rows are required for train/validation/test.")
    train_end = int(len(ordered) * 0.60)
    validation_end = int(len(ordered) * 0.80)
    return (
        ordered.iloc[:train_end].copy(),
        ordered.iloc[train_end:validation_end].copy(),
        ordered.iloc[validation_end:].copy(),
    )


def metrics(actual: pd.Series, predicted: np.ndarray) -> dict[str, float]:
    return {
        "mae": round(float(mean_absolute_error(actual, predicted)), 2),
        "rmse": round(float(mean_squared_error(actual, predicted) ** 0.5), 2),
        "r2": round(float(r2_score(actual, predicted)), 4),
    }


def build_xgboost() -> Pipeline:
    return Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="median")),
            (
                "model",
                XGBRegressor(
                    n_estimators=250,
                    max_depth=3,
                    learning_rate=0.03,
                    subsample=0.9,
                    colsample_bytree=0.9,
                    objective="reg:squarederror",
                    random_state=RANDOM_SEED,
                    n_jobs=1,
                    tree_method="hist",
                ),
            ),
        ]
    )


def seasonal_naive_predictions(features: pd.DataFrame) -> np.ndarray:
    """Seven-day seasonal naive baseline, using only the prior week's net flow."""
    return features["net_cash_flow_lag_7"].to_numpy(dtype=float)


def validate_daily_data(daily: pd.DataFrame, features: pd.DataFrame) -> dict[str, Any]:
    expected = pd.date_range(daily["date"].min(), daily["date"].max(), freq="D")
    return {
        "daily_rows": int(len(daily)),
        "feature_ready_rows": int(len(features)),
        "date_range": {
            "start": daily["date"].min().date().isoformat(),
            "end": daily["date"].max().date().isoformat(),
        },
        "missing_dates": int(len(expected) - daily["date"].nunique()),
        "null_values_in_daily_data": int(daily.isna().sum().sum()),
        "null_values_in_feature_data": int(features[list(FEATURE_COLUMNS) + [TARGET]].isna().sum().sum()),
        "leakage_control": "Rolling and lag features use values through t-1 only; target is day t net cash flow.",
    }


def train(business_id: str | None = None) -> dict[str, Any]:
    """Run the complete chronological cash-flow forecasting training workflow."""
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    EVALUATION_DIR.mkdir(parents=True, exist_ok=True)
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

    daily = load_daily_cash_flow(business_id)
    features = build_feature_frame(daily)
    quality = validate_daily_data(daily, features)
    if quality["missing_dates"] or quality["null_values_in_daily_data"] or quality["null_values_in_feature_data"]:
        raise ValueError(f"Cash-flow data quality checks failed: {quality}")

    features.to_csv(DATASET_PATH, index=False)
    QUALITY_PATH.write_text(json.dumps(quality, indent=2), encoding="utf-8")

    train_data, validation_data, test_data = chronological_split(features)
    x_train, y_train = train_data[list(FEATURE_COLUMNS)], train_data[TARGET]
    x_validation, y_validation = validation_data[list(FEATURE_COLUMNS)], validation_data[TARGET]
    x_test, y_test = test_data[list(FEATURE_COLUMNS)], test_data[TARGET]

    baseline_validation = seasonal_naive_predictions(validation_data)
    baseline_test = seasonal_naive_predictions(test_data)

    candidate = build_xgboost()
    candidate.fit(x_train, y_train)
    xgb_validation = candidate.predict(x_validation)
    xgb_test = candidate.predict(x_test)

    evaluations = {
        "seasonal_naive": {
            "validation": metrics(y_validation, baseline_validation),
            "test": metrics(y_test, baseline_test),
        },
        "xgboost": {
            "validation": metrics(y_validation, xgb_validation),
            "test": metrics(y_test, xgb_test),
        },
    }
    selected_name = min(evaluations, key=lambda name: evaluations[name]["validation"]["rmse"])

    fit_data = pd.concat([train_data, validation_data], ignore_index=True)
    if selected_name == "xgboost":
        selected_model = build_xgboost()
    else:
        selected_model = SeasonalNaiveRegressor()
    selected_model.fit(fit_data[list(FEATURE_COLUMNS)], fit_data[TARGET])
    joblib.dump(selected_model, MODEL_PATH)

    business = str(daily["business_id"].iloc[0])
    metadata = {
        "model_name": "xgboost_regressor" if selected_name == "xgboost" else "seasonal_naive_lag_7",
        "target_column": TARGET,
        "feature_columns": list(FEATURE_COLUMNS),
        "business_id": business,
        "training_date_range": [train_data["date"].min().date().isoformat(), train_data["date"].max().date().isoformat()],
        "validation_date_range": [validation_data["date"].min().date().isoformat(), validation_data["date"].max().date().isoformat()],
        "test_date_range": [test_data["date"].min().date().isoformat(), test_data["date"].max().date().isoformat()],
        "evaluation_metrics": evaluations,
        "trained_at_utc": datetime.now(UTC).isoformat(),
        "cash_balance_limitation": "No verified current cash balance is used or forecast. The engine forecasts daily net cash flow only.",
        "shortage_detection_limitation": "The schema has no reliable minimum cash threshold, so cash-shortage detection is intentionally deferred.",
        "component_forecast_limitation": "The model forecasts net cash flow only; predicted inflow and outflow are null.",
    }
    METADATA_PATH.write_text(json.dumps(metadata, indent=2), encoding="utf-8")

    predictor = CashFlowPredictor(MODEL_PATH, METADATA_PATH)
    forecast_example = predictor.forecast(7, business_id=business)
    result = {
        "data_quality": quality,
        "split_rows": {"train": len(train_data), "validation": len(validation_data), "test": len(test_data)},
        "evaluations": evaluations,
        "selected_model": selected_name,
        "forecast_example": forecast_example,
    }
    EVALUATION_PATH.write_text(json.dumps(result, indent=2), encoding="utf-8")
    return result


if __name__ == "__main__":
    print(json.dumps(train(), indent=2))
