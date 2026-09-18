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

from ml.src.features.cash_flow_dataset import (  # noqa: E402
    FEATURE_COLUMNS,
    build_feature_frame,
    build_future_feature_row,
)
from ml.src.prediction.cash_flow_predictor import CashFlowPredictor  # noqa: E402


def daily_frame(days: int = 50) -> pd.DataFrame:
    dates = pd.date_range("2026-01-01", periods=days, freq="D")
    inflow = [100 + index for index in range(days)]
    outflow = [50 + (index % 5) for index in range(days)]
    net = [received - paid for received, paid in zip(inflow, outflow)]
    return pd.DataFrame(
        {
            "business_id": "business-1",
            "date": dates,
            "cash_inflow": inflow,
            "cash_outflow": outflow,
            "net_cash_flow": net,
        }
    )


class ConstantRegressor:
    def predict(self, values):
        return [12.5] * len(values)


class CashFlowPipelineTests(unittest.TestCase):
    def test_features_are_prior_day_only(self):
        data = daily_frame()
        features = build_feature_frame(data)
        first = features.iloc[0]
        source_index = data.index[data["date"] == first["date"]][0]
        self.assertEqual(first["net_cash_flow_lag_1"], data.loc[source_index - 1, "net_cash_flow"])
        self.assertEqual(
            first["cash_inflow_rolling_7"],
            data.loc[source_index - 7:source_index - 1, "cash_inflow"].mean(),
        )
        self.assertFalse(features[list(FEATURE_COLUMNS)].isna().any().any())

    def test_future_row_updates_net_lags(self):
        history = daily_frame()
        future = build_future_feature_row(history, pd.Timestamp("2026-02-20"))
        self.assertEqual(future["net_cash_flow_lag_1"], history.iloc[-1]["net_cash_flow"])
        self.assertEqual(future["day_of_week"], 4)

    def test_forecast_structure(self):
        with TemporaryDirectory() as directory:
            model_path = Path(directory) / "cash_flow_forecast_model.joblib"
            metadata_path = Path(directory) / "cash_flow_forecast_metadata.json"
            joblib.dump(ConstantRegressor(), model_path)
            metadata_path.write_text(json.dumps({"feature_columns": list(FEATURE_COLUMNS)}))
            predictor = CashFlowPredictor(model_path, metadata_path)
            with patch(
                "ml.src.prediction.cash_flow_predictor.load_daily_cash_flow",
                return_value=daily_frame(),
            ):
                for horizon in (7, 30, 60, 90):
                    result = predictor.forecast(horizon)
                    self.assertEqual(len(result), horizon)
                    self.assertEqual(result[0]["predicted_inflow"], None)
                    self.assertEqual(result[0]["predicted_outflow"], None)
                    self.assertEqual(
                        set(result[0]),
                        {"forecast_date", "predicted_inflow", "predicted_outflow", "predicted_net_cash_flow"},
                    )
                    self.assertEqual(result[0]["forecast_date"], "2026-02-20")


if __name__ == "__main__":
    unittest.main()
