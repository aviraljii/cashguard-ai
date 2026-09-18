"""Combine existing customer models with transparent business metrics."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any, Protocol

import pandas as pd

from ml.src.data.mysql_loader import load_query
from ml.src.prediction.customer_churn_predictor import CustomerChurnPredictor
from ml.src.prediction.customer_segmentation_predictor import CustomerSegmentationPredictor
from ml.src.prediction.payment_delay_predictor import PaymentDelayPredictor


ROOT = Path(__file__).resolve().parents[3]
INTELLIGENCE_QUERY = ROOT / "database" / "queries" / "customer_intelligence.sql"
MODEL_DIRECTORY = ROOT / "ml" / "models"

# The weights total 100. When payment risk cannot be produced by the existing
# invoice-level model, its 25 points are excluded and the available weighted
# score is rescaled to 0--100 rather than treating unknown risk as low risk.
PRIORITY_WEIGHTS = {
    "churn": 35.0,
    "payment_risk": 25.0,
    "value": 20.0,
    "recency": 10.0,
    "at_risk_segment": 10.0,
}


class Predictor(Protocol):
    def predict(self, identifier: str) -> dict[str, Any]: ...


class CustomerIntelligenceService:
    """Read-only customer intelligence orchestrator; it does not train models."""

    def __init__(
        self,
        churn_predictor: Predictor | None = None,
        segmentation_predictor: Predictor | None = None,
        payment_delay_predictor: Predictor | None = None,
    ) -> None:
        self.churn_predictor = churn_predictor or CustomerChurnPredictor(
            MODEL_DIRECTORY / "customer_churn_model.joblib"
        )
        self.segmentation_predictor = segmentation_predictor or CustomerSegmentationPredictor(
            MODEL_DIRECTORY / "customer_segmentation_model.joblib"
        )
        self.payment_delay_predictor = payment_delay_predictor or PaymentDelayPredictor(
            MODEL_DIRECTORY / "payment_delay_risk_model.joblib"
        )

    def get_customer_metrics(self, customer_id: str) -> dict[str, Any]:
        """Load one customer's completed-sales behavioral metrics."""
        data = load_query(INTELLIGENCE_QUERY.read_text(encoding="utf-8"), (customer_id,))
        if data.empty:
            raise ValueError(f"Customer not found: {customer_id}")
        return self._to_native(data.iloc[0].to_dict())

    def get_portfolio_max_sales_value(self) -> float:
        """Return a read-only portfolio scale used only to normalize value."""
        query = """
        SELECT COALESCE(MAX(customer_sales_value), 0) AS max_sales_value
        FROM (
            SELECT COALESCE(SUM(total_amount), 0) AS customer_sales_value
            FROM sales
            WHERE status = 'completed' AND sale_date <= CURDATE()
            GROUP BY customer_id
        ) AS customer_totals
        """
        data = load_query(query)
        return float(data.iloc[0]["max_sales_value"]) if not data.empty else 0.0

    def get_payment_risk(self, customer_id: str) -> dict[str, Any]:
        """Score the newest invoice eligible for the unchanged invoice model."""
        invoice_query = """
        SELECT id
        FROM invoices
        WHERE customer_id = %s AND status <> 'void'
        ORDER BY invoice_date DESC, id DESC
        """
        invoices = load_query(invoice_query, (customer_id,))
        for invoice_id in invoices.get("id", pd.Series(dtype=str)).astype(str):
            try:
                prediction = self.payment_delay_predictor.predict(invoice_id)
                return {
                    "status": "available",
                    "invoice_id": prediction["invoice_id"],
                    "probability": prediction["risk_probability"],
                    "score": prediction["risk_score"],
                    "risk_category": prediction["risk_category"],
                }
            except ValueError:
                # The predictor is authoritative about its historical-data
                # eligibility requirement; try an older invoice if needed.
                continue
        return {
            "status": "unavailable",
            "invoice_id": None,
            "probability": None,
            "score": None,
            "risk_category": None,
            "reason": "No invoice is eligible for the existing payment-delay model.",
        }

    @staticmethod
    def estimated_customer_lifetime_value(metrics: dict[str, Any]) -> float:
        """Historical-behavior value estimate, not a predictive CLV model."""
        total_orders = float(metrics["total_orders"])
        if total_orders == 0 or metrics["first_purchase_date"] is None:
            return 0.0
        first_purchase = pd.Timestamp(metrics["first_purchase_date"])
        last_purchase = pd.Timestamp(metrics["last_purchase_date"])
        observed_lifetime_months = max((last_purchase - first_purchase).days / 30.0, 1.0)
        frequency = total_orders / observed_lifetime_months
        return round(float(metrics["average_order_value"]) * frequency * observed_lifetime_months, 2)

    @staticmethod
    def priority_category(score: float) -> str:
        if score < 25:
            return "Low"
        if score < 50:
            return "Medium"
        if score < 75:
            return "High"
        return "Critical"

    def calculate_priority(
        self,
        churn: dict[str, Any],
        segmentation: dict[str, Any],
        payment_risk: dict[str, Any],
        value: float,
        portfolio_max_value: float,
        recency_days: float,
    ) -> dict[str, Any]:
        """Apply the documented, normalized business-rule priority formula."""
        components = {
            "churn": float(churn["churn_score"]),
            "value": min(value / portfolio_max_value, 1.0) * 100 if portfolio_max_value > 0 else 0.0,
            "recency": min(max(recency_days, 0.0) / 90.0, 1.0) * 100,
            "at_risk_segment": 100.0 if segmentation["segment_name"] == "At Risk" else 0.0,
        }
        if payment_risk["status"] == "available":
            components["payment_risk"] = float(payment_risk["score"])

        used_weight = sum(PRIORITY_WEIGHTS[name] for name in components)
        weighted_score = sum(
            PRIORITY_WEIGHTS[name] * component for name, component in components.items()
        )
        score = round(weighted_score / used_weight, 2) if used_weight else 0.0
        return {"score": score, "category": self.priority_category(score)}

    def build(self, customer_id: str) -> dict[str, Any]:
        """Return one deterministic unified customer intelligence response."""
        metrics = self.get_customer_metrics(customer_id)
        if int(metrics["total_orders"]) == 0:
            raise ValueError(f"Customer has no completed sales: {customer_id}")

        churn_raw = self.churn_predictor.predict(customer_id)
        segmentation_raw = self.segmentation_predictor.predict(customer_id)
        payment_risk = self.get_payment_risk(customer_id)
        value = self.estimated_customer_lifetime_value(metrics)
        priority = self.calculate_priority(
            churn_raw,
            segmentation_raw,
            payment_risk,
            value,
            self.get_portfolio_max_sales_value(),
            float(metrics["recency_days"]),
        )

        churn = {
            "probability": churn_raw["churn_probability"],
            "score": churn_raw["churn_score"],
            "risk_category": churn_raw["risk_category"],
        }
        segmentation = {
            "cluster_id": segmentation_raw["cluster_id"],
            "segment_name": segmentation_raw["segment_name"],
            "segment_score": segmentation_raw["segment_score"],
        }
        response = {
            "customer_id": str(customer_id),
            "behavior": {
                key: metrics[key]
                for key in (
                    "total_orders", "total_sales_value", "average_order_value",
                    "first_purchase_date", "last_purchase_date", "recency_days",
                    "active_months", "purchase_frequency", "average_days_between_orders",
                    "recent_30_day_orders", "recent_30_day_sales", "recent_90_day_orders",
                    "recent_90_day_sales",
                )
            },
            "churn": churn,
            "segmentation": segmentation,
            "payment_risk": payment_risk,
            "value": {"estimated_customer_lifetime_value": value},
            "profitability": {
                "status": "insufficient_cost_data",
                "estimated_profit": None,
                "margin": None,
            },
            "priority": priority,
        }
        response["business_signals"] = self.business_signals(response)
        return response

    @staticmethod
    def business_signals(response: dict[str, Any]) -> list[str]:
        """Produce deterministic, evidence-based operational signals."""
        signals: list[str] = []
        value = response["value"]["estimated_customer_lifetime_value"]
        high_value = value > 0 and response["priority"]["score"] >= 50
        if high_value and response["churn"]["probability"] >= 0.34:
            signals.append("High-value customer with elevated churn risk")
        if (response["payment_risk"]["status"] == "available"
                and response["payment_risk"]["probability"] >= 0.34):
            signals.append("Payment-delay risk requires collection attention")
        if (response["segmentation"]["segment_name"] == "At Risk"
                and response["behavior"]["recency_days"] >= 30):
            signals.append("At-risk segment with declining activity")
        if (response["segmentation"]["segment_name"] == "High Value Loyal"
                and response["churn"]["risk_category"] == "Low"):
            signals.append("High-value loyal customer with low churn risk")
        if not signals:
            signals.append("Customer requires routine monitoring based on available data")
        return signals

    @staticmethod
    def _to_native(values: dict[str, Any]) -> dict[str, Any]:
        """Convert pandas and MySQL scalar values into JSON-friendly primitives."""
        converted: dict[str, Any] = {}
        for key, value in values.items():
            if pd.isna(value):
                converted[key] = None
            elif isinstance(value, Decimal):
                converted[key] = float(value)
            elif isinstance(value, (date, datetime, pd.Timestamp)):
                converted[key] = value.isoformat()
            elif hasattr(value, "item"):
                converted[key] = value.item()
            else:
                converted[key] = value
        return converted
