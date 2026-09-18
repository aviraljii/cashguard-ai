"""Product demand, movement, stock, and reorder intelligence without new ML."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any

import pandas as pd

from ml.src.data.mysql_loader import load_sql_file


ROOT = Path(__file__).resolve().parents[3]
INVENTORY_QUERY = ROOT / "database" / "queries" / "inventory_intelligence.sql"


class InventoryIntelligenceService:
    """Read-only, deterministic inventory intelligence for a single product."""

    def load_inventory_data(self) -> pd.DataFrame:
        """Load active products and their supported sales and ledger measures."""
        data = load_sql_file(INVENTORY_QUERY)
        if data.empty:
            raise ValueError("No active products were returned by inventory intelligence query.")
        if data["product_id"].duplicated().any():
            raise ValueError("Inventory intelligence query returned duplicate products.")
        for column in (
            "total_units_sold", "recent_7_day_units_sold", "recent_30_day_units_sold",
            "recent_90_day_units_sold", "previous_30_day_units_sold", "average_daily_demand",
            "inventory_transaction_count",
        ):
            data[column] = pd.to_numeric(data[column], errors="coerce").fillna(0.0)
        return data

    def get_product_metrics(self, product_id: str) -> tuple[dict[str, Any], pd.DataFrame]:
        """Return one product and its portfolio context for relative movement rules."""
        data = self.load_inventory_data()
        selected = data.loc[data["product_id"].astype(str) == str(product_id)]
        if selected.empty:
            raise ValueError(f"Product not found or inactive: {product_id}")
        return self._to_native(selected.iloc[0].to_dict()), data

    @staticmethod
    def demand_trend(recent_30: float, previous_30: float) -> str:
        """Classify a 30-day demand change using ±25% thresholds."""
        if recent_30 <= 0:
            return "No Recent Demand"
        if previous_30 <= 0:
            return "Increasing"
        change = (recent_30 - previous_30) / previous_30
        if change >= 0.25:
            return "Increasing"
        if change <= -0.25:
            return "Decreasing"
        return "Stable"

    @staticmethod
    def movement_category(metrics: dict[str, Any], portfolio: pd.DataFrame) -> str:
        """Use positive 90-day demand quartiles, keeping zero recent demand distinct."""
        recent_demand = float(metrics["recent_90_day_units_sold"])
        if recent_demand <= 0:
            return "No Movement"
        positive = portfolio.loc[portfolio["recent_90_day_units_sold"] > 0, "recent_90_day_units_sold"]
        if positive.empty:
            return "No Movement"
        lower, upper = positive.quantile([0.25, 0.75]).tolist()
        if recent_demand >= upper:
            return "Fast Moving"
        if recent_demand <= lower:
            return "Slow Moving"
        return "Normal Moving"

    @staticmethod
    def stock_state(metrics: dict[str, Any], demand_rate: float) -> dict[str, Any]:
        """Expose only a non-negative balance backed by ledger activity."""
        activity = float(metrics["inventory_transaction_count"])
        balance = metrics["derived_current_quantity"]
        if activity <= 0 or balance is None or float(balance) < 0:
            return {
                "status": "insufficient_inventory_balance_data",
                "current_quantity": None,
                "estimated_days_of_stock": None,
            }
        quantity = float(balance)
        return {
            "status": "derived_from_inventory_transaction_ledger",
            "current_quantity": quantity,
            "estimated_days_of_stock": round(quantity / demand_rate, 2) if demand_rate > 0 else None,
        }

    @staticmethod
    def stockout_risk(stock: dict[str, Any], demand_rate: float) -> dict[str, Any]:
        if stock["current_quantity"] is None:
            return {"score": None, "category": "Unavailable"}
        if demand_rate <= 0:
            return {"score": 0, "category": "Low"}
        days = stock["estimated_days_of_stock"]
        if days <= 7:
            return {"score": 100, "category": "Critical"}
        if days <= 14:
            return {"score": 75, "category": "High"}
        if days <= 30:
            return {"score": 45, "category": "Medium"}
        return {"score": 10, "category": "Low"}

    @staticmethod
    def overstock_risk(stock: dict[str, Any], movement: str, trend: str) -> dict[str, Any]:
        if stock["current_quantity"] is None:
            return {"score": None, "category": "Unavailable"}
        days = stock["estimated_days_of_stock"]
        if stock["current_quantity"] == 0:
            return {"score": 0, "category": "Low"}
        if days is None:
            return {"score": 90, "category": "Critical"} if movement == "No Movement" else {"score": 0, "category": "Low"}
        if days > 180 and movement in {"Slow Moving", "No Movement"}:
            return {"score": 90, "category": "Critical"}
        if days > 120 and (movement == "Slow Moving" or trend == "Decreasing"):
            return {"score": 75, "category": "High"}
        if days > 90:
            return {"score": 50, "category": "Medium"}
        return {"score": 10, "category": "Low"}

    @staticmethod
    def reorder_recommendation(stock: dict[str, Any], demand_rate: float) -> dict[str, Any]:
        if stock["current_quantity"] is None:
            return {
                "status": "insufficient_inventory_balance_data",
                "recommended_order_quantity": None,
                "reason": "A reliable transaction-ledger balance is unavailable.",
            }
        if demand_rate <= 0:
            return {
                "status": "no_recent_demand",
                "recommended_order_quantity": None,
                "reason": "No supported daily demand rate exists; supplier lead time is unavailable.",
            }
        if stock["estimated_days_of_stock"] <= 30:
            return {
                "status": "review_reorder_without_lead_time",
                "recommended_order_quantity": None,
                "reason": "Stock covers 30 days or fewer; lead time is not stored, so no quantity is estimated.",
            }
        return {
            "status": "no_reorder_needed_based_on_observed_demand",
            "recommended_order_quantity": None,
            "reason": "Observed stock coverage exceeds 30 days; supplier lead time is unavailable.",
        }

    def build(self, product_id: str) -> dict[str, Any]:
        """Return deterministic integrated intelligence for one active product."""
        metrics, portfolio = self.get_product_metrics(product_id)
        recent_30 = float(metrics["recent_30_day_units_sold"])
        previous_30 = float(metrics["previous_30_day_units_sold"])
        trend = self.demand_trend(recent_30, previous_30)
        movement = self.movement_category(metrics, portfolio)
        # Current demand protects against stockout for fast-rising recent demand.
        demand_rate = max(float(metrics["average_daily_demand"]), recent_30 / 30.0)
        stock = self.stock_state(metrics, demand_rate)
        stock["stockout_risk"] = self.stockout_risk(stock, demand_rate)
        stock["overstock_risk"] = self.overstock_risk(stock, movement, trend)
        reorder = self.reorder_recommendation(stock, demand_rate)
        response = {
            "product_id": str(product_id),
            "product": {"name": metrics["product_name"], "category": metrics["category"]},
            "demand": {
                "total_units_sold": metrics["total_units_sold"],
                "average_daily_demand": round(float(metrics["average_daily_demand"]), 4),
                "recent_7_day_demand": metrics["recent_7_day_units_sold"],
                "recent_30_day_demand": metrics["recent_30_day_units_sold"],
                "recent_90_day_demand": metrics["recent_90_day_units_sold"],
                "trend": trend,
                "last_sale_date": metrics["last_sale_date"],
                "days_since_last_sale": metrics["days_since_last_sale"],
            },
            "movement": {"category": movement},
            "stock": stock,
            "reorder": reorder,
        }
        response["signals"] = self.business_signals(response)
        return response

    @staticmethod
    def business_signals(response: dict[str, Any]) -> list[str]:
        signals: list[str] = []
        trend = response["demand"]["trend"]
        movement = response["movement"]["category"]
        if trend == "Increasing":
            signals.append("Demand is increasing")
        elif trend == "Decreasing":
            signals.append("Recent demand is declining")
        elif trend == "No Recent Demand":
            signals.append("Product has limited recent demand")
        if movement == "Fast Moving":
            signals.append("Product is fast moving")
        if response["stock"]["stockout_risk"]["category"] in {"High", "Critical"}:
            signals.append("Stock-out risk is high")
        if response["stock"]["overstock_risk"]["category"] in {"High", "Critical"}:
            signals.append("Inventory appears excessive relative to demand")
        return signals

    @staticmethod
    def _to_native(values: dict[str, Any]) -> dict[str, Any]:
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
