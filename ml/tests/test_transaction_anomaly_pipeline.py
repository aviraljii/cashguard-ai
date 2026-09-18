import json
import os
import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

import joblib
import pandas as pd


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from ml.src.features.transaction_anomaly_dataset import FEATURE_COLUMNS, prepare_model_features  # noqa: E402
from ml.src.prediction.transaction_anomaly_predictor import TransactionAnomalyPredictor  # noqa: E402


def transaction_frame() -> pd.DataFrame:
    return pd.DataFrame([{
        "transaction_id": "transaction-1", "business_id": "business-1", "transaction_date": pd.Timestamp("2026-01-31"),
        "transaction_type": "debit", "category": "Supplier payment", "amount": 10000.0,
        "is_credit": 0, "has_supplier_context": 1, "day_of_week": 5, "day_of_month": 31, "month": 1,
        "log_amount": 9.21, "historical_transaction_count_30d": 20, "rolling_average_amount_30d": 1000.0,
        "rolling_stddev_amount_30d": 1000.0, "transaction_amount_relative_to_history": 10.0,
        "transaction_amount_zscore": 9.0, "transaction_frequency_30d": 0.67, "category_share_of_type_30d": 0.04,
    }])


class FakeAnomalyModel:
    def score_samples(self, values):
        return [-0.8] * len(values)


class TransactionAnomalyPipelineTests(unittest.TestCase):
    @unittest.skipUnless(all(os.getenv(name) for name in ("DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_PASSWORD")), "MySQL environment variables are required")
    def test_mysql_query_and_loader_exclude_future_rows(self):
        from ml.src.features.transaction_anomaly_dataset import load_transaction_features

        raw = load_transaction_features()
        prepared = prepare_model_features(raw)
        self.assertGreater(len(raw), 0)
        self.assertFalse(raw["transaction_id"].duplicated().any())
        self.assertFalse((raw["transaction_date"] > pd.Timestamp.now().normalize()).any())
        self.assertFalse(prepared[list(FEATURE_COLUMNS)].isna().any().any())

    def test_prepared_features_have_no_nulls(self):
        data = transaction_frame()
        data.loc[0, "rolling_stddev_amount_30d"] = None
        prepared = prepare_model_features(data)
        self.assertFalse(prepared[list(FEATURE_COLUMNS)].isna().any().any())
        self.assertEqual(prepared.loc[0, "history_available_30d"], 1)

    def test_predictor_output_and_reasons(self):
        with TemporaryDirectory() as directory:
            model_path = Path(directory) / "transaction_anomaly_model.joblib"
            metadata_path = Path(directory) / "transaction_anomaly_metadata.json"
            joblib.dump(FakeAnomalyModel(), model_path)
            metadata_path.write_text(json.dumps({
                "feature_columns": list(FEATURE_COLUMNS), "anomaly_score_threshold": 0.6,
                "risk_score_thresholds": {"low": 0.2, "medium": 0.4, "high": 0.6},
            }))
            predictor = TransactionAnomalyPredictor(model_path, metadata_path)
            with patch("ml.src.prediction.transaction_anomaly_predictor.load_transaction_features", return_value=transaction_frame()):
                result = predictor.predict("transaction-1")
        self.assertEqual(set(result), {"transaction_id", "anomaly_score", "is_anomaly", "risk_category", "reasons"})
        self.assertEqual(result["anomaly_score"], 0.8)
        self.assertGreaterEqual(result["anomaly_score"], 0)
        self.assertTrue(result["is_anomaly"])
        self.assertEqual(result["risk_category"], "High")
        self.assertTrue(result["reasons"])

    def test_unknown_transaction_is_rejected(self):
        with TemporaryDirectory() as directory:
            model_path = Path(directory) / "transaction_anomaly_model.joblib"
            metadata_path = Path(directory) / "transaction_anomaly_metadata.json"
            joblib.dump(FakeAnomalyModel(), model_path)
            metadata_path.write_text(json.dumps({"feature_columns": list(FEATURE_COLUMNS), "anomaly_score_threshold": .6, "risk_score_thresholds": {"low": .2, "medium": .4, "high": .6}}))
            predictor = TransactionAnomalyPredictor(model_path, metadata_path)
            with patch("ml.src.prediction.transaction_anomaly_predictor.load_transaction_features", return_value=transaction_frame()):
                with self.assertRaises(ValueError):
                    predictor.predict("not-found")


if __name__ == "__main__":
    unittest.main()
