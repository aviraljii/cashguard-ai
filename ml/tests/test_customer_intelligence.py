import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from ml.src.customer_intelligence.customer_intelligence_service import (  # noqa: E402
    CustomerIntelligenceService,
)


CUSTOMER_ID = "customer-1"
METRICS = {
    "customer_id": CUSTOMER_ID,
    "as_of_date": pd.Timestamp("2026-08-14"),
    "total_orders": 12,
    "total_sales_value": 24000.0,
    "average_order_value": 2000.0,
    "first_purchase_date": pd.Timestamp("2025-08-14"),
    "last_purchase_date": pd.Timestamp("2026-08-04"),
    "recency_days": 10,
    "active_months": 10,
    "purchase_frequency": 1.0,
    "average_days_between_orders": 32.0,
    "recent_30_day_orders": 1,
    "recent_30_day_sales": 2000.0,
    "recent_90_day_orders": 3,
    "recent_90_day_sales": 6000.0,
    "customer_age_days": 365,
}
CHURN = {"customer_id": CUSTOMER_ID, "churn_probability": 0.8, "churn_score": 80.0, "risk_category": "High"}
SEGMENT = {"customer_id": CUSTOMER_ID, "cluster_id": 1, "segment_name": "At Risk", "segment_score": 0.6}
PAYMENT = {"invoice_id": "invoice-1", "risk_probability": 0.7, "risk_score": 70, "risk_category": "High"}


class CustomerIntelligenceTests(unittest.TestCase):
    def service(self):
        return CustomerIntelligenceService(Mock(), Mock(), Mock())

    @patch("ml.src.customer_intelligence.customer_intelligence_service.load_query")
    def test_customer_data_loading_uses_parameterized_query(self, load_query):
        load_query.return_value = pd.DataFrame([METRICS])
        result = self.service().get_customer_metrics(CUSTOMER_ID)
        self.assertEqual(result["customer_id"], CUSTOMER_ID)
        self.assertEqual(result["total_orders"], 12)
        self.assertEqual(load_query.call_args.args[1], (CUSTOMER_ID,))

    @patch("ml.src.customer_intelligence.customer_intelligence_service.load_query")
    def test_existing_payment_predictor_integration(self, load_query):
        predictor = Mock()
        predictor.predict.return_value = PAYMENT
        load_query.return_value = pd.DataFrame([{"id": "invoice-1"}])
        result = CustomerIntelligenceService(Mock(), Mock(), predictor).get_payment_risk(CUSTOMER_ID)
        predictor.predict.assert_called_once_with("invoice-1")
        self.assertEqual(result["score"], 70)
        self.assertEqual(result["status"], "available")

    def test_existing_churn_and_segmentation_predictors_are_called(self):
        churn, segmentation, payment = Mock(), Mock(), Mock()
        churn.predict.return_value = CHURN
        segmentation.predict.return_value = SEGMENT
        payment.predict.return_value = PAYMENT
        service = CustomerIntelligenceService(churn, segmentation, payment)
        with patch.object(service, "get_customer_metrics", return_value=METRICS), \
             patch.object(service, "get_payment_risk", return_value={
                 "status": "available", "invoice_id": "invoice-1", "probability": .7,
                 "score": 70, "risk_category": "High",
             }), \
             patch.object(service, "get_portfolio_max_sales_value", return_value=30000.0):
            response = service.build(CUSTOMER_ID)
        churn.predict.assert_called_once_with(CUSTOMER_ID)
        segmentation.predict.assert_called_once_with(CUSTOMER_ID)
        self.assertEqual(response["churn"]["score"], 80.0)
        self.assertEqual(response["segmentation"]["segment_name"], "At Risk")

    def test_clv_calculation_is_historical_and_deterministic(self):
        self.assertEqual(self.service().estimated_customer_lifetime_value(METRICS), 24000.0)
        no_orders = {**METRICS, "total_orders": 0}
        self.assertEqual(self.service().estimated_customer_lifetime_value(no_orders), 0.0)

    def test_profitability_is_never_fabricated(self):
        response = self._build_response()
        self.assertEqual(response["profitability"]["status"], "insufficient_cost_data")
        self.assertIsNone(response["profitability"]["estimated_profit"])
        self.assertIsNone(response["profitability"]["margin"])

    def test_priority_score_range_and_categories(self):
        service = self.service()
        self.assertEqual(service.priority_category(0), "Low")
        self.assertEqual(service.priority_category(25), "Medium")
        self.assertEqual(service.priority_category(50), "High")
        self.assertEqual(service.priority_category(75), "Critical")
        priority = service.calculate_priority(CHURN, SEGMENT, {
            "status": "available", "score": 70,
        }, 24000, 30000, 10)
        self.assertGreaterEqual(priority["score"], 0)
        self.assertLessEqual(priority["score"], 100)

    def test_unified_response_is_deterministic_and_complete(self):
        first = self._build_response()
        second = self._build_response()
        self.assertEqual(first, second)
        self.assertEqual(set(first), {
            "customer_id", "behavior", "churn", "segmentation", "payment_risk",
            "value", "profitability", "priority", "business_signals",
        })
        self.assertIn("Payment-delay risk requires collection attention", first["business_signals"])

    def test_missing_customer_and_ineligible_payment_data(self):
        service = self.service()
        with patch("ml.src.customer_intelligence.customer_intelligence_service.load_query", return_value=pd.DataFrame()):
            with self.assertRaises(ValueError):
                service.get_customer_metrics("missing")
            self.assertEqual(service.get_payment_risk("missing")["status"], "unavailable")

    def _build_response(self):
        service = self.service()
        with patch.object(service, "get_customer_metrics", return_value=METRICS), \
             patch.object(service.churn_predictor, "predict", return_value=CHURN), \
             patch.object(service.segmentation_predictor, "predict", return_value=SEGMENT), \
             patch.object(service, "get_payment_risk", return_value={
                 "status": "available", "invoice_id": "invoice-1", "probability": .7,
                 "score": 70, "risk_category": "High",
             }), \
             patch.object(service, "get_portfolio_max_sales_value", return_value=30000.0):
            return service.build(CUSTOMER_ID)


if __name__ == "__main__":
    unittest.main()
