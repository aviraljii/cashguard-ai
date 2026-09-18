import json
import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

import joblib
import pandas as pd


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from ml.src.features.sales_forecast_dataset import (  # noqa: E402
    FEATURE_COLUMNS,
    build_feature_frame,
    build_future_feature_row,
)
from ml.src.prediction.sales_forecast_predictor import SalesForecastPredictor  # noqa: E402


def daily_frame(days: int = 70) -> pd.DataFrame:
    dates = pd.date_range("2026-01-01", periods=days, freq="D")
    sales = [1000 + index * 10 for index in range(days)]
    orders = [5 + index % 3 for index in range(days)]
    return pd.DataFrame({
        "business_id": "business-1", "date": dates,
        "daily_sales_amount": sales, "daily_order_count": orders,
    })


class ConstantRegressor:
    def predict(self, values):
        return [125.5] * len(values)


class SalesForecastPipelineTests(unittest.TestCase):
    def test_features_use_prior_days_only(self):
        data = daily_frame()
        features = build_feature_frame(data)
        first = features.iloc[0]
        source_index = data.index[data["date"] == first["date"]][0]
        self.assertEqual(first["sales_lag_1"], data.loc[source_index - 1, "daily_sales_amount"])
        self.assertEqual(first["sales_lag_30"], data.loc[source_index - 30, "daily_sales_amount"])
        self.assertEqual(
            first["rolling_7_day_sales"],
            data.loc[source_index - 7:source_index - 1, "daily_sales_amount"].mean(),
        )
        self.assertFalse(features[list(FEATURE_COLUMNS)].isna().any().any())

    def test_future_features_use_previous_predictions_only(self):
        history = daily_frame()
        future = build_future_feature_row(history, pd.Timestamp("2026-03-12"))
        self.assertEqual(future["sales_lag_1"], history.iloc[-1]["daily_sales_amount"])
        self.assertEqual(future["day_of_week"], 3)

    def test_forecast_output_and_horizons(self):
        with TemporaryDirectory() as directory:
            model_path = Path(directory) / "sales_forecast_model.joblib"
            metadata_path = Path(directory) / "sales_forecast_metadata.json"
            joblib.dump(ConstantRegressor(), model_path)
            metadata_path.write_text(json.dumps({"feature_columns": list(FEATURE_COLUMNS)}))
            predictor = SalesForecastPredictor(model_path, metadata_path)
            with patch(
                "ml.src.prediction.sales_forecast_predictor.load_daily_sales",
                return_value=daily_frame(),
            ):
                for horizon in (7, 30, 60, 90):
                    result = predictor.forecast(horizon)
                    self.assertEqual(len(result), horizon)
                    self.assertEqual(result[0]["forecast_date"], "2026-03-12")
                    self.assertEqual(result[0]["predicted_sales"], 125.5)
                    self.assertIsNone(result[0]["predicted_orders"])
                    self.assertEqual(
                        set(result[0]),
                        {"forecast_date", "predicted_sales", "predicted_orders"},
                    )


if __name__ == "__main__":
    unittest.main()
