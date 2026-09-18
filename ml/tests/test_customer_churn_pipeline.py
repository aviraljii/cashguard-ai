import json
import os
import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

import joblib
import numpy as np
import pandas as pd


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from ml.src.features.customer_churn_dataset import FEATURE_COLUMNS, TARGET, _prepare  # noqa: E402
from ml.src.prediction.customer_churn_predictor import CustomerChurnPredictor, risk_category  # noqa: E402
from ml.training.train_customer_churn import chronological_split  # noqa: E402


def snapshot_frame() -> pd.DataFrame:
    rows = []
    for date_index, date in enumerate(pd.date_range("2025-01-01", periods=10, freq="30D")):
        for customer_index in range(2):
            row = {"customer_id": f"customer-{customer_index}", "snapshot_date": date, TARGET: customer_index}
            for feature_index, feature in enumerate(FEATURE_COLUMNS):
                row[feature] = float(date_index + customer_index + feature_index + 1)
            rows.append(row)
    return pd.DataFrame(rows)


class FakeChurnModel:
    def predict_proba(self, values):
        return np.array([[.2, .8] for _ in range(len(values))])


class CustomerChurnPipelineTests(unittest.TestCase):
    @unittest.skipUnless(all(os.getenv(name) for name in ("DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_PASSWORD")), "MySQL environment variables are required")
    def test_mysql_dataset_loader_and_target(self):
        from ml.src.features.customer_churn_dataset import load_historical_churn_dataset

        data = load_historical_churn_dataset()
        self.assertGreater(len(data), 0)
        self.assertEqual(set(data[TARGET].unique()), {0, 1})
        self.assertFalse(data.duplicated(["customer_id", "snapshot_date"]).any())
        self.assertFalse(data[list(FEATURE_COLUMNS)].isna().any().any())
        self.assertFalse((data["snapshot_date"] + pd.Timedelta(days=90) > pd.Timestamp.now().normalize()).any())

    def test_growth_values_are_prepared_without_nulls(self):
        data = snapshot_frame()
        data.loc[0, "sales_growth_rate"] = None
        prepared = _prepare(data, require_target=True)
        self.assertEqual(prepared.loc[0, "sales_growth_rate"], 0.0)
        self.assertFalse(prepared[list(FEATURE_COLUMNS)].isna().any().any())

    def test_split_is_chronological_by_whole_snapshot_date(self):
        train, validation, test = chronological_split(snapshot_frame())
        self.assertLess(train["snapshot_date"].max(), validation["snapshot_date"].min())
        self.assertLess(validation["snapshot_date"].max(), test["snapshot_date"].min())
        self.assertEqual(set(train["snapshot_date"]) & set(validation["snapshot_date"]), set())

    def test_predictor_schema_and_risk_mapping(self):
        with TemporaryDirectory() as directory:
            model_path = Path(directory) / "customer_churn_model.joblib"
            metadata_path = Path(directory) / "customer_churn_metadata.json"
            joblib.dump(FakeChurnModel(), model_path)
            metadata_path.write_text(json.dumps({"feature_columns": list(FEATURE_COLUMNS)}))
            predictor = CustomerChurnPredictor(model_path, metadata_path)
            current = _prepare(snapshot_frame().iloc[:1].drop(columns=[TARGET]), require_target=False)
            with patch("ml.src.prediction.customer_churn_predictor.load_current_customer_features", return_value=current):
                result = predictor.predict("customer-0")
        self.assertEqual(set(result), {"customer_id", "churn_probability", "churn_score", "risk_category"})
        self.assertEqual(result["churn_probability"], .8)
        self.assertEqual(result["churn_score"], 80.0)
        self.assertEqual(result["risk_category"], "High")
        self.assertEqual(risk_category(.33), "Low")
        self.assertEqual(risk_category(.34), "Medium")


if __name__ == "__main__":
    unittest.main()
