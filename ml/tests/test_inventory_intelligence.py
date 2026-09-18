import sys
import unittest
from pathlib import Path
from unittest.mock import patch

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from ml.src.inventory_intelligence import InventoryIntelligenceService  # noqa: E402


PRODUCT_ID = "product-1"
METRICS = {
    "product_id": PRODUCT_ID,
    "product_name": "Test Product",
    "category": "Staples",
    "total_units_sold": 100.0,
    "recent_7_day_units_sold": 10.0,
    "recent_30_day_units_sold": 30.0,
    "recent_90_day_units_sold": 90.0,
    "previous_30_day_units_sold": 20.0,
    "completed_sale_count": 20.0,
    "first_sale_date": "2026-05-01",
    "last_sale_date": "2026-08-14",
    "days_since_last_sale": 1.0,
    "average_daily_demand": 0.8,
    "derived_current_quantity": 15.0,
    "inventory_transaction_count": 10.0,
    "last_inventory_transaction_date": "2026-08-14",
}


class InventoryIntelligenceTests(unittest.TestCase):
    def service(self):
        return InventoryIntelligenceService()

    def portfolio(self, recent=(20.0, 40.0, 60.0, 90.0)):
        return pd.DataFrame([{
            **METRICS, "product_id": f"p-{index}", "recent_90_day_units_sold": value,
        } for index, value in enumerate(recent)])

    @patch("ml.src.inventory_intelligence.inventory_intelligence_service.load_sql_file")
    def test_query_data_loading_and_product_lookup(self, load_sql_file):
        load_sql_file.return_value = pd.DataFrame([METRICS])
        metrics, portfolio = self.service().get_product_metrics(PRODUCT_ID)
        self.assertEqual(metrics["product_name"], "Test Product")
        self.assertEqual(len(portfolio), 1)

    @patch("ml.src.inventory_intelligence.inventory_intelligence_service.load_sql_file")
    def test_invalid_product_and_missing_query_data(self, load_sql_file):
        load_sql_file.return_value = pd.DataFrame([METRICS])
        with self.assertRaises(ValueError):
            self.service().get_product_metrics("missing")
        load_sql_file.return_value = pd.DataFrame()
        with self.assertRaises(ValueError):
            self.service().load_inventory_data()

    def test_demand_trend_thresholds(self):
        service = self.service()
        self.assertEqual(service.demand_trend(0, 10), "No Recent Demand")
        self.assertEqual(service.demand_trend(10, 0), "Increasing")
        self.assertEqual(service.demand_trend(25, 20), "Increasing")
        self.assertEqual(service.demand_trend(15, 20), "Decreasing")
        self.assertEqual(service.demand_trend(22, 20), "Stable")

    def test_movement_categories_use_portfolio_quantiles(self):
        service = self.service()
        portfolio = self.portfolio()
        self.assertEqual(service.movement_category({**METRICS, "recent_90_day_units_sold": 0}, portfolio), "No Movement")
        self.assertEqual(service.movement_category({**METRICS, "recent_90_day_units_sold": 20}, portfolio), "Slow Moving")
        self.assertEqual(service.movement_category({**METRICS, "recent_90_day_units_sold": 90}, portfolio), "Fast Moving")
        self.assertEqual(service.movement_category({**METRICS, "recent_90_day_units_sold": 50}, portfolio), "Normal Moving")

    def test_stock_availability_and_risks(self):
        service = self.service()
        unavailable = service.stock_state({**METRICS, "inventory_transaction_count": 0}, 1)
        self.assertIsNone(unavailable["current_quantity"])
        available = service.stock_state(METRICS, 1)
        self.assertEqual(available["estimated_days_of_stock"], 15.0)
        self.assertEqual(service.stockout_risk(available, 1)["category"], "Medium")
        self.assertEqual(service.overstock_risk(available, "Slow Moving", "Decreasing")["category"], "Low")
        critical_overstock = service.overstock_risk(
            {"current_quantity": 50, "estimated_days_of_stock": None}, "No Movement", "No Recent Demand"
        )
        self.assertEqual(critical_overstock["category"], "Critical")

    def test_reorder_recommendation_never_invents_quantity(self):
        service = self.service()
        review = service.reorder_recommendation({"current_quantity": 10, "estimated_days_of_stock": 10}, 1)
        self.assertEqual(review["status"], "review_reorder_without_lead_time")
        self.assertIsNone(review["recommended_order_quantity"])
        missing = service.reorder_recommendation({"current_quantity": None, "estimated_days_of_stock": None}, 1)
        self.assertEqual(missing["status"], "insufficient_inventory_balance_data")

    def test_unified_response_signals_and_determinism(self):
        service = self.service()
        with patch.object(service, "get_product_metrics", return_value=(METRICS, self.portfolio())):
            first = service.build(PRODUCT_ID)
            second = service.build(PRODUCT_ID)
        self.assertEqual(first, second)
        self.assertEqual(first["demand"]["trend"], "Increasing")
        self.assertIn("Demand is increasing", first["signals"])
        self.assertIn("Product is fast moving", first["signals"])
        self.assertEqual(first["stock"]["current_quantity"], 15.0)


if __name__ == "__main__":
    unittest.main()
