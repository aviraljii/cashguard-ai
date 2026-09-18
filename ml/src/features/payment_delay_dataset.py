"""Leakage-safe historical payment-delay training dataset."""
from __future__ import annotations

from pathlib import Path

import pandas as pd

from ml.src.data.mysql_loader import load_sql_file

ROOT = Path(__file__).resolve().parents[3]
TRAINING_QUERY = ROOT / "database" / "queries" / "customer_payment_risk_training.sql"
TARGET = "late_payment_target"
IDENTIFIERS = ("invoice_id", "customer_id", "as_of_date")
FEATURE_COLUMNS = (
    "invoice_amount", "payment_terms_days",
    "historical_invoice_count", "historical_total_invoice_value", "historical_average_invoice_amount",
    "historical_paid_invoice_count", "historical_late_payment_count", "historical_late_payment_rate",
    "historical_average_payment_delay_days", "historical_max_payment_delay_days",
    "historical_outstanding_amount", "historical_outstanding_ratio",
)


def load_historical_dataset() -> pd.DataFrame:
    """Load rows whose inputs predate their invoice outcome."""
    data = load_sql_file(TRAINING_QUERY)
    data["as_of_date"] = pd.to_datetime(data["as_of_date"])
    data[TARGET] = data[TARGET].astype(int)
    return data
