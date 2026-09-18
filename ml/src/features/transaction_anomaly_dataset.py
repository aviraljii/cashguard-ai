"""Leakage-safe MySQL feature loading for bank-transaction anomaly detection."""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from ml.src.data.mysql_loader import load_sql_file


ROOT = Path(__file__).resolve().parents[3]
QUERY_PATH = ROOT / "database" / "queries" / "transaction_anomaly_features.sql"
NUMERIC_FEATURE_COLUMNS = (
    "log_amount", "is_credit", "has_supplier_context", "day_of_week", "day_of_month", "month",
    "historical_transaction_count_30d", "rolling_average_amount_30d", "rolling_stddev_amount_30d",
    "transaction_amount_relative_to_history", "transaction_amount_zscore",
    "transaction_frequency_30d", "category_share_of_type_30d", "history_available_30d",
)
CATEGORICAL_FEATURE_COLUMNS = ("transaction_type", "category")
FEATURE_COLUMNS = (*NUMERIC_FEATURE_COLUMNS, *CATEGORICAL_FEATURE_COLUMNS)
HISTORICAL_COLUMNS = (
    "historical_transaction_count_30d", "rolling_average_amount_30d", "rolling_stddev_amount_30d",
    "transaction_amount_relative_to_history", "transaction_amount_zscore",
    "transaction_frequency_30d", "category_share_of_type_30d",
)


def load_transaction_features(business_id: str | None = None) -> pd.DataFrame:
    """Load current-or-earlier ledger transactions and their prior-day features."""
    data = load_sql_file(QUERY_PATH)
    if data.empty:
        raise ValueError("MySQL returned no current-or-earlier bank transactions.")
    data["transaction_date"] = pd.to_datetime(data["transaction_date"])
    if business_id is not None:
        data = data.loc[data["business_id"].astype(str) == str(business_id)].copy()
    if data.empty:
        raise ValueError(f"No bank transactions found for business_id={business_id}.")
    if data["transaction_id"].duplicated().any():
        raise ValueError("Transaction feature query returned duplicate transaction IDs.")
    if (data["transaction_date"] > pd.Timestamp.now().normalize()).any():
        raise ValueError("Transaction feature query returned future-dated rows.")
    if data[["amount", "log_amount"]].isna().any().any() or (data["amount"] <= 0).any():
        raise ValueError("Transactions must have non-null, positive amounts.")
    return data.sort_values(["transaction_date", "transaction_id"]).reset_index(drop=True)


def prepare_model_features(data: pd.DataFrame) -> pd.DataFrame:
    """Make early-history values explicit and model-ready without discarding outliers."""
    frame = data.copy()
    frame["history_available_30d"] = (frame["historical_transaction_count_30d"].fillna(0) > 0).astype(int)
    # Missing historical values mean no prior category/direction history, not a
    # zero transaction. The availability flag preserves that distinction.
    frame[list(HISTORICAL_COLUMNS)] = frame[list(HISTORICAL_COLUMNS)].fillna(0.0)
    for column in NUMERIC_FEATURE_COLUMNS:
        frame[column] = pd.to_numeric(frame[column], errors="raise").fillna(0.0)
    if frame[list(FEATURE_COLUMNS)].isna().any().any():
        raise ValueError("Prepared anomaly features contain null values.")
    return frame
