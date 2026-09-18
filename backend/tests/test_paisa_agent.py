import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from paisa.agent import classify_intent, grounded_response, is_action_request


class PaisaAgentTests(unittest.TestCase):
    def test_hinglish_forecast_routes_to_cashflow_forecast(self):
        intents = classify_intent("Agale 7 din mein cash shortage ka risk hai?")
        self.assertIn("forecast", intents)
        self.assertIn("cash_flow", intents)

    def test_missing_forecast_is_not_estimated(self):
        answer = grounded_response(["forecast"], {"forecast": None}, "en")
        self.assertIn("will not estimate", answer)

    def test_verified_receivable_follow_up_is_explained(self):
        answer = grounded_response(["receivables"], {"invoices": {"outstanding": 15000, "count": 2, "overdue_amount": 5000, "overdue_count": 1, "priority_follow_ups": [{"customer_name": "Acme", "invoice_number": "INV-1", "outstanding": 5000}]}}, "en")
        self.assertIn("Acme", answer)
        self.assertIn("₹5,000.00", answer)

    def test_consequential_request_needs_confirmation(self):
        self.assertTrue(is_action_request("Please prepare payment to a vendor"))
        self.assertFalse(is_action_request("Show my payment status"))


if __name__ == "__main__":
    unittest.main()
