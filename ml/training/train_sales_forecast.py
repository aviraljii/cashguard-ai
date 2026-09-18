"""Train, evaluate, and persist CashGuard's daily sales forecast model."""

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

from ml.src.data.mysql_loader import load_query  # noqa: E402
from ml.src.features.sales_forecast_dataset import (  # noqa: E402
    FEATURE_COLUMNS,
    TARGET,
    build_feature_frame,
    load_daily_sales,
)
from ml.src.prediction.sales_forecast_predictor import SalesForecastPredictor  # noqa: E402


MODEL_DIR = ROOT / "ml" / "models"
EVALUATION_DIR = ROOT / "ml" / "evaluation" / "sales_forecast"
PROCESSED_DIR = ROOT / "ml" / "data" / "processed"
MODEL_PATH = MODEL_DIR / "sales_forecast_model.joblib"
METADATA_PATH = MODEL_DIR / "sales_forecast_metadata.json"
EVALUATION_PATH = EVALUATION_DIR / "sales_forecast_evaluation.json"
QUALITY_PATH = EVALUATION_DIR / "sales_forecast_data_quality.json"
DATASET_PATH = PROCESSED_DIR / "daily_sales_features.csv"
RANDOM_SEED = 42


class SeasonalNaiveRegressor:
    """Serializable weekly seasonal-naive model using the previous-week sale."""

    def fit(self, features: pd.DataFrame, target: pd.Series) -> "SeasonalNaiveRegressor":
        return self

    def predict(self, features: pd.DataFrame) -> np.ndarray:
        return features["sales_lag_7"].to_numpy(dtype=float)


def chronological_split(data: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Split 60/20/20 by date; observations are never shuffled."""
    ordered = data.sort_values("date").reset_index(drop=True)
    if len(ordered) < 90:
        raise ValueError("At least 90 feature-ready daily rows are required for train/validation/test.")
    train_end = int(len(ordered) * 0.60)
    validation_end = int(len(ordered) * 0.80)
    return ordered.iloc[:train_end].copy(), ordered.iloc[train_end:validation_end].copy(), ordered.iloc[validation_end:].copy()


def metrics(actual: pd.Series, predicted: np.ndarray) -> dict[str, float | int | None]:
    actual_values = actual.to_numpy(dtype=float)
    non_zero = actual_values != 0
    return {
        "mae": round(float(mean_absolute_error(actual_values, predicted)), 2),
        "rmse": round(float(mean_squared_error(actual_values, predicted) ** 0.5), 2),
        "r2": round(float(r2_score(actual_values, predicted)), 4),
        "mape": (
            round(float(np.mean(np.abs((actual_values[non_zero] - predicted[non_zero]) / actual_values[non_zero])) * 100), 2)
            if bool(non_zero.any()) else None
        ),
        "mape_evaluated_rows": int(non_zero.sum()),
        "zero_actual_rows_excluded_from_mape": int((~non_zero).sum()),
    }


def build_xgboost() -> Pipeline:
    return Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="median")),
            ("model", XGBRegressor(
                n_estimators=250, max_depth=3, learning_rate=0.03,
                subsample=0.9, colsample_bytree=0.9, objective="reg:squarederror",
                random_state=RANDOM_SEED, n_jobs=1, tree_method="hist",
            )),
        ]
    )


def source_diagnostics() -> dict[str, int]:
    """Check raw source conditions without joining sale_items into revenue."""
    row = load_query("""
        SELECT
            SUM(sale_date > CURDATE()) AS future_dated_sales_rows,
            SUM(status <> 'completed') AS non_completed_sales_rows,
            (SELECT COUNT(*) FROM (
                SELECT business_id, sale_number FROM sales
                GROUP BY business_id, sale_number HAVING COUNT(*) > 1
            ) duplicates) AS duplicate_business_sale_numbers
        FROM sales
    """).iloc[0]
    return {key: int(row[key] or 0) for key in row.index}


def validate_daily_data(daily: pd.DataFrame, features: pd.DataFrame) -> dict[str, Any]:
    expected = pd.date_range(daily["date"].min(), daily["date"].max(), freq="D")
    diagnostics = source_diagnostics()
    return {
        "daily_rows": int(len(daily)),
        "feature_ready_rows": int(len(features)),
        "date_range": {"start": daily["date"].min().date().isoformat(), "end": daily["date"].max().date().isoformat()},
        "missing_dates": int(len(expected) - daily["date"].nunique()),
        "null_values_in_daily_data": int(daily.isna().sum().sum()),
        "null_values_in_feature_data": int(features[[*FEATURE_COLUMNS, TARGET]].isna().sum().sum()),
        "future_dates_in_dataset": int((daily["date"] > pd.Timestamp.now().normalize()).sum()),
        "source_diagnostics": diagnostics,
        "leakage_control": "Sales lags and rolling values use data through t-1 only; target is day t daily_sales_amount.",
    }


def train(business_id: str | None = None) -> dict[str, Any]:
    """Run the full daily sales forecasting training workflow."""
    for directory in (MODEL_DIR, EVALUATION_DIR, PROCESSED_DIR):
        directory.mkdir(parents=True, exist_ok=True)
    daily = load_daily_sales(business_id)
    features = build_feature_frame(daily)
    quality = validate_daily_data(daily, features)
    if any((quality["missing_dates"], quality["null_values_in_daily_data"], quality["null_values_in_feature_data"], quality["future_dates_in_dataset"])):
        raise ValueError(f"Daily sales data-quality checks failed: {quality}")
    if quality["source_diagnostics"]["duplicate_business_sale_numbers"]:
        raise ValueError(f"Duplicate sales identifiers found: {quality['source_diagnostics']}")
    features.to_csv(DATASET_PATH, index=False)
    QUALITY_PATH.write_text(json.dumps(quality, indent=2), encoding="utf-8")
    train_data, validation_data, test_data = chronological_split(features)
    x_train, y_train = train_data[list(FEATURE_COLUMNS)], train_data[TARGET]
    x_validation, y_validation = validation_data[list(FEATURE_COLUMNS)], validation_data[TARGET]
    x_test, y_test = test_data[list(FEATURE_COLUMNS)], test_data[TARGET]
    baseline_validation = SeasonalNaiveRegressor().predict(x_validation)
    baseline_test = SeasonalNaiveRegressor().predict(x_test)
    candidate = build_xgboost()
    candidate.fit(x_train, y_train)
    xgb_validation, xgb_test = candidate.predict(x_validation), candidate.predict(x_test)
    evaluations = {
        "seasonal_naive": {"validation": metrics(y_validation, baseline_validation), "test": metrics(y_test, baseline_test)},
        "xgboost": {"validation": metrics(y_validation, xgb_validation), "test": metrics(y_test, xgb_test)},
    }
    selected_name = min(evaluations, key=lambda name: evaluations[name]["validation"]["rmse"])
    selected_model = build_xgboost() if selected_name == "xgboost" else SeasonalNaiveRegressor()
    fit_data = pd.concat([train_data, validation_data], ignore_index=True)
    selected_model.fit(fit_data[list(FEATURE_COLUMNS)], fit_data[TARGET])
    joblib.dump(selected_model, MODEL_PATH)
    business = str(daily["business_id"].iloc[0])
    metadata = {
        "model_name": "xgboost_regressor" if selected_name == "xgboost" else "seasonal_naive_lag_7",
        "target_column": TARGET, "feature_columns": list(FEATURE_COLUMNS), "business_id": business,
        "training_date_range": [train_data["date"].min().date().isoformat(), train_data["date"].max().date().isoformat()],
        "validation_date_range": [validation_data["date"].min().date().isoformat(), validation_data["date"].max().date().isoformat()],
        "test_date_range": [test_data["date"].min().date().isoformat(), test_data["date"].max().date().isoformat()],
        "evaluation_metrics": evaluations, "trained_at_utc": datetime.now(UTC).isoformat(),
        "data_source": "Completed, non-future sales header rows aggregated by sale_date; sale_items are not joined.",
        "order_forecast_limitation": "Order count is a historical feature only; predicted_orders is null because no order-count model is trained.",
    }
    METADATA_PATH.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    predictor = SalesForecastPredictor(MODEL_PATH, METADATA_PATH)
    result = {
        "data_quality": quality,
        "split_rows": {"train": len(train_data), "validation": len(validation_data), "test": len(test_data)},
        "evaluations": evaluations, "selected_model": selected_name,
        "forecast_example": predictor.forecast(7, business_id=business),
    }
    EVALUATION_PATH.write_text(json.dumps(result, indent=2), encoding="utf-8")
    return result


if __name__ == "__main__":
    print(json.dumps(train(), indent=2))
