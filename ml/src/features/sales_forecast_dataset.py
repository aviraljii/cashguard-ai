"""Leakage-safe MySQL dataset and features for daily sales forecasting."""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from ml.src.data.mysql_loader import load_sql_file


ROOT = Path(__file__).resolve().parents[3]
DAILY_SALES_QUERY = ROOT / "database" / "queries" / "daily_sales.sql"
TARGET = "daily_sales_amount"
ORDER_COLUMN = "daily_order_count"
BASE_COLUMNS = (TARGET, ORDER_COLUMN)
FEATURE_COLUMNS = (
    "sales_lag_1",
    "sales_lag_7",
    "sales_lag_14",
    "sales_lag_30",
    "rolling_7_day_sales",
    "rolling_14_day_sales",
    "rolling_30_day_sales",
    "rolling_7_day_orders",
    "rolling_30_day_orders",
    "day_of_week",
    "day_of_month",
    "month",
    "days_since_series_start",
)


def load_daily_sales(business_id: str | None = None) -> pd.DataFrame:
    """Load one business's continuous daily completed-sales time series."""
    data = load_sql_file(DAILY_SALES_QUERY)
    if data.empty:
        raise ValueError("MySQL returned no completed sales rows.")
    data["date"] = pd.to_datetime(data["date"])
    business_ids = data["business_id"].dropna().unique()
    if business_id is None:
        if len(business_ids) != 1:
            raise ValueError("Multiple businesses were returned; provide a business_id explicitly.")
        business_id = str(business_ids[0])
    data = data.loc[data["business_id"].astype(str) == str(business_id)].copy()
    if data.empty:
        raise ValueError(f"No completed sales rows found for business_id={business_id}.")
    data = data.sort_values("date").reset_index(drop=True)
    expected_dates = pd.date_range(data["date"].min(), data["date"].max(), freq="D")
    if len(data) != len(expected_dates) or not data["date"].equals(pd.Series(expected_dates)):
        raise ValueError("Daily sales query did not return a complete contiguous date range.")
    for column in BASE_COLUMNS:
        data[column] = pd.to_numeric(data[column], errors="raise")
    if data[list(BASE_COLUMNS)].isna().any().any():
        raise ValueError("Daily sales data contains null values.")
    return data


def build_feature_frame(daily_sales: pd.DataFrame) -> pd.DataFrame:
    """Create features known before each target date; never use day-t sales."""
    required = {"date", *BASE_COLUMNS}
    missing = required.difference(daily_sales.columns)
    if missing:
        raise ValueError(f"Missing daily sales columns: {sorted(missing)}")
    frame = daily_sales.sort_values("date").copy()
    frame["date"] = pd.to_datetime(frame["date"])
    prior_sales = frame[TARGET].shift(1)
    prior_orders = frame[ORDER_COLUMN].shift(1)
    for lag in (1, 7, 14, 30):
        frame[f"sales_lag_{lag}"] = frame[TARGET].shift(lag)
    for window in (7, 14, 30):
        frame[f"rolling_{window}_day_sales"] = prior_sales.rolling(window, min_periods=window).mean()
    for window in (7, 30):
        frame[f"rolling_{window}_day_orders"] = prior_orders.rolling(window, min_periods=window).mean()
    frame["day_of_week"] = frame["date"].dt.dayofweek
    frame["day_of_month"] = frame["date"].dt.day
    frame["month"] = frame["date"].dt.month
    frame["days_since_series_start"] = (frame["date"] - frame["date"].min()).dt.days
    return frame.dropna(subset=[*FEATURE_COLUMNS, TARGET]).reset_index(drop=True)


def build_future_feature_row(history: pd.DataFrame, forecast_date: pd.Timestamp) -> dict[str, float | int]:
    """Build one recursive feature row from actual and previous predictions only."""
    if len(history) < 30:
        raise ValueError("At least 30 days of history are required to forecast sales.")
    sales = history[TARGET].dropna()
    orders = history[ORDER_COLUMN].dropna()
    row: dict[str, float | int] = {
        "day_of_week": int(forecast_date.dayofweek),
        "day_of_month": int(forecast_date.day),
        "month": int(forecast_date.month),
        "days_since_series_start": int((forecast_date - history["date"].min()).days),
    }
    for lag in (1, 7, 14, 30):
        row[f"sales_lag_{lag}"] = float(sales.iloc[-lag])
    for window in (7, 14, 30):
        row[f"rolling_{window}_day_sales"] = float(sales.tail(window).mean())
    # Orders are not modeled, so their future values are unavailable. Retain
    # observed-history summaries rather than fabricate future orders.
    for window in (7, 30):
        row[f"rolling_{window}_day_orders"] = float(orders.tail(window).mean())
    return row
