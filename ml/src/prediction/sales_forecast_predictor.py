"""Reusable predictor for CashGuard daily sales forecasts."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import joblib
import pandas as pd

from ml.src.features.sales_forecast_dataset import (
    ORDER_COLUMN,
    TARGET,
    build_future_feature_row,
    load_daily_sales,
)


class SalesForecastPredictor:
    """Load a persisted model and recursively forecast up to 90 calendar days."""

    def __init__(self, model_path: str | Path, metadata_path: str | Path | None = None):
        self.model_path = Path(model_path)
        if not self.model_path.exists():
            raise FileNotFoundError(f"Model file not found: {self.model_path}")
        self.model = joblib.load(self.model_path)
        metadata_path = Path(metadata_path) if metadata_path else self.model_path.with_name(
            "sales_forecast_metadata.json"
        )
        if not metadata_path.exists():
            raise FileNotFoundError(f"Metadata file not found: {metadata_path}")
        self.metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        self.features = self.metadata["feature_columns"]

    def forecast(self, horizon_days: int, business_id: str | None = None) -> list[dict[str, Any]]:
        if horizon_days not in {7, 30, 60, 90}:
            raise ValueError("horizon_days must be one of: 7, 30, 60, 90.")
        history = load_daily_sales(business_id)
        next_date = history["date"].iloc[-1] + pd.Timedelta(days=1)
        results: list[dict[str, Any]] = []
        for offset in range(horizon_days):
            forecast_date = next_date + pd.Timedelta(days=offset)
            feature_row = build_future_feature_row(history, forecast_date)
            prediction = max(0.0, float(self.model.predict(pd.DataFrame([feature_row])[self.features])[0]))
            results.append(
                {
                    "forecast_date": forecast_date.date().isoformat(),
                    "predicted_sales": round(prediction, 2),
                    "predicted_orders": None,
                }
            )
            history = pd.concat(
                [
                    history,
                    pd.DataFrame(
                        [{"date": forecast_date, TARGET: prediction, ORDER_COLUMN: None}]
                    ),
                ],
                ignore_index=True,
            )
        return results
