import json
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

import pandas as pd
from sklearn.dummy import DummyClassifier

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from ml.src.data.mysql_loader import load_query
from ml.src.prediction.payment_delay_predictor import PaymentDelayPredictor, risk_category


class PaymentDelayPipelineTests(unittest.TestCase):
    def test_loader_rejects_mutating_query(self):
        with self.assertRaises(ValueError):
            load_query("DELETE FROM invoices")

    @patch("ml.src.data.mysql_loader.mysql.connector.connect")
    def test_loader_closes_connection(self, connect):
        cursor = MagicMock()
        cursor.fetchall.return_value = [{"value": 1}]
        connection = MagicMock()
        connection.cursor.return_value = cursor
        connection.is_connected.return_value = True
        connect.return_value = connection
        with patch("ml.src.data.mysql_loader.database_config", return_value={}):
            self.assertEqual(load_query("SELECT 1").iloc[0]["value"], 1)
        cursor.close.assert_called_once()
        connection.close.assert_called_once()

    def test_risk_categories(self):
        self.assertEqual(risk_category(0.0), "Low")
        self.assertEqual(risk_category(0.34), "Medium")
        self.assertEqual(risk_category(0.67), "High")

    def test_prediction_score_range(self):
        from tempfile import TemporaryDirectory
        import joblib
        with TemporaryDirectory() as directory:
            model = DummyClassifier(strategy="prior").fit([[1], [2]], [0, 1])
            model_path = Path(directory) / "model.joblib"
            metadata_path = Path(directory) / "metadata.json"
            joblib.dump(model, model_path)
            metadata_path.write_text(json.dumps({"feature_columns": ["feature"]}))
            result = PaymentDelayPredictor(model_path, metadata_path).predict({"feature": 4})
        self.assertGreaterEqual(result["risk_score"], 0)
        self.assertLessEqual(result["risk_score"], 100)
        self.assertIn(result["risk_category"], {"Low", "Medium", "High"})


if __name__ == "__main__":
    unittest.main()
