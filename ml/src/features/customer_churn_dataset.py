"""Point-in-time MySQL datasets for customer churn training and prediction."""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from ml.src.data.mysql_loader import load_query, load_sql_file


ROOT = Path(__file__).resolve().parents[3]
TRAINING_QUERY = ROOT / "database" / "queries" / "customer_churn_training.sql"
TARGET = "churn_target"
FEATURE_COLUMNS = (
    "recency_days", "purchase_frequency", "total_orders", "total_sales_value", "average_order_value",
    "recent_30_day_orders", "recent_30_day_sales", "recent_90_day_orders", "recent_90_day_sales",
    "historical_customer_age_days", "average_days_between_orders", "last_purchase_amount",
    "sales_growth_rate", "order_frequency_trend",
)


def _prepare(data: pd.DataFrame, require_target: bool) -> pd.DataFrame:
    data = data.copy()
    data["snapshot_date"] = pd.to_datetime(data["snapshot_date"])
    if require_target:
        data[TARGET] = data[TARGET].astype(int)
    # Zero is a neutral feature representation for a no-comparison period; it
    # does not drop the customer or hide the actual recent activity features.
    data[["sales_growth_rate", "order_frequency_trend"]] = data[["sales_growth_rate", "order_frequency_trend"]].fillna(0.0)
    for column in FEATURE_COLUMNS:
        data[column] = pd.to_numeric(data[column], errors="raise").fillna(0.0)
    if data[list(FEATURE_COLUMNS)].isna().any().any():
        raise ValueError("Customer churn features contain null values.")
    return data


def load_historical_churn_dataset() -> pd.DataFrame:
    """Load labelled snapshots with fully observed 90-day forward windows."""
    return _prepare(load_sql_file(TRAINING_QUERY), require_target=True)


def load_current_customer_features(customer_id: str) -> pd.DataFrame:
    """Reconstruct the training feature contract at the latest observed sales date."""
    query = """
    WITH completed_sales AS (
        SELECT id, customer_id, sale_date, total_amount FROM sales
        WHERE status = 'completed' AND sale_date <= CURDATE()
    ), latest AS (SELECT MAX(sale_date) AS snapshot_date FROM completed_sales),
    customer_sales AS (
        SELECT cs.*, LAG(sale_date) OVER (PARTITION BY customer_id ORDER BY sale_date, id) AS previous_sale_date
        FROM completed_sales cs WHERE customer_id = %s
    )
    SELECT c.id AS customer_id, l.snapshot_date,
           DATEDIFF(l.snapshot_date, MAX(h.sale_date)) AS recency_days,
           COUNT(h.id) / NULLIF(GREATEST(DATEDIFF(l.snapshot_date, c.created_at), 1) / 30.0, 0) AS purchase_frequency,
           COUNT(h.id) AS total_orders, COALESCE(SUM(h.total_amount), 0) AS total_sales_value,
           COALESCE(AVG(h.total_amount), 0) AS average_order_value,
           COALESCE(SUM(h.sale_date > l.snapshot_date - INTERVAL 30 DAY), 0) AS recent_30_day_orders,
           COALESCE(SUM(CASE WHEN h.sale_date > l.snapshot_date - INTERVAL 30 DAY THEN h.total_amount ELSE 0 END), 0) AS recent_30_day_sales,
           COALESCE(SUM(h.sale_date > l.snapshot_date - INTERVAL 90 DAY), 0) AS recent_90_day_orders,
           COALESCE(SUM(CASE WHEN h.sale_date > l.snapshot_date - INTERVAL 90 DAY THEN h.total_amount ELSE 0 END), 0) AS recent_90_day_sales,
           DATEDIFF(l.snapshot_date, c.created_at) AS historical_customer_age_days,
           COALESCE(AVG(CASE WHEN h.previous_sale_date IS NOT NULL THEN DATEDIFF(h.sale_date, h.previous_sale_date) END), 0) AS average_days_between_orders,
           CAST(SUBSTRING_INDEX(GROUP_CONCAT(h.total_amount ORDER BY h.sale_date DESC, h.id DESC SEPARATOR ','), ',', 1) AS DECIMAL(14,2)) AS last_purchase_amount,
           (COALESCE(SUM(CASE WHEN h.sale_date > l.snapshot_date - INTERVAL 30 DAY THEN h.total_amount ELSE 0 END), 0) -
            COALESCE(SUM(CASE WHEN h.sale_date > l.snapshot_date - INTERVAL 60 DAY AND h.sale_date <= l.snapshot_date - INTERVAL 30 DAY THEN h.total_amount ELSE 0 END), 0)) /
            NULLIF(COALESCE(SUM(CASE WHEN h.sale_date > l.snapshot_date - INTERVAL 60 DAY AND h.sale_date <= l.snapshot_date - INTERVAL 30 DAY THEN h.total_amount ELSE 0 END), 0), 0) AS sales_growth_rate,
           (COALESCE(SUM(h.sale_date > l.snapshot_date - INTERVAL 30 DAY), 0) - COALESCE(SUM(h.sale_date > l.snapshot_date - INTERVAL 60 DAY AND h.sale_date <= l.snapshot_date - INTERVAL 30 DAY), 0)) /
            NULLIF(COALESCE(SUM(h.sale_date > l.snapshot_date - INTERVAL 60 DAY AND h.sale_date <= l.snapshot_date - INTERVAL 30 DAY), 0), 0) AS order_frequency_trend
    FROM customers c CROSS JOIN latest l JOIN customer_sales h ON h.customer_id = c.id
    WHERE c.id = %s GROUP BY c.id, l.snapshot_date, c.created_at
    """
    data = load_query(query, (customer_id, customer_id))
    if data.empty:
        raise ValueError(f"Customer not found or has no completed sales: {customer_id}")
    return _prepare(data, require_target=False)
