"""Leakage-safe MySQL dataset and features for daily cash-flow forecasting."""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from ml.src.data.mysql_loader import load_sql_file


ROOT = Path(__file__).resolve().parents[3]
DAILY_CASH_FLOW_QUERY = ROOT / "database" / "queries" / "daily_cash_flow.sql"
TARGET = "net_cash_flow"
BASE_FLOW_COLUMNS = ("cash_inflow", "cash_outflow", TARGET)
FEATURE_COLUMNS = (
    "cash_inflow_rolling_7",
    "cash_outflow_rolling_7",
    "net_cash_flow_rolling_7",
    "cash_inflow_rolling_30",
    "cash_outflow_rolling_30",
    "net_cash_flow_rolling_30",
    "net_cash_flow_lag_1",
    "net_cash_flow_lag_7",
    "day_of_week",
    "day_of_month",
    "month",
    "days_since_series_start",
)


def load_daily_cash_flow(business_id: str | None = None) -> pd.DataFrame:
    """Load one business's continuous daily bank-ledger cash-flow series."""
    data = load_sql_file(DAILY_CASH_FLOW_QUERY)
    if data.empty:
        raise ValueError("MySQL returned no bank-ledger cash-flow rows.")

    data["date"] = pd.to_datetime(data["date"])
    business_ids = data["business_id"].dropna().unique()

    if business_id is None:
        if len(business_ids) != 1:
            raise ValueError(
                "Multiple businesses were returned; provide a business_id explicitly."
            )
        business_id = str(business_ids[0])

    data = data.loc[data["business_id"].astype(str) == str(business_id)].copy()
    if data.empty:
        raise ValueError(f"No bank-ledger cash-flow rows found for business_id={business_id}.")

    data = data.sort_values("date").reset_index(drop=True)
    expected_dates = pd.date_range(data["date"].min(), data["date"].max(), freq="D")
    if len(data) != len(expected_dates) or not data["date"].equals(pd.Series(expected_dates)):
        raise ValueError("Daily cash-flow query did not return a complete contiguous date range.")

    for column in BASE_FLOW_COLUMNS:
        data[column] = pd.to_numeric(data[column], errors="raise")

    if data[list(BASE_FLOW_COLUMNS)].isna().any().any():
        raise ValueError("Daily cash-flow data contains null monetary values.")

    return data


def build_feature_frame(daily_cash_flow: pd.DataFrame) -> pd.DataFrame:
    """Create features known before each target day; all rolling values stop at t-1."""
    required = {"date", *BASE_FLOW_COLUMNS}
    missing = required.difference(daily_cash_flow.columns)
    if missing:
        raise ValueError(f"Missing cash-flow columns: {sorted(missing)}")

    frame = daily_cash_flow.sort_values("date").copy()
    frame["date"] = pd.to_datetime(frame["date"])

    for source, suffix in (
        ("cash_inflow", "cash_inflow"),
        ("cash_outflow", "cash_outflow"),
        (TARGET, "net_cash_flow"),
    ):
        prior_values = frame[source].shift(1)
        frame[f"{suffix}_rolling_7"] = prior_values.rolling(7, min_periods=7).mean()
        frame[f"{suffix}_rolling_30"] = prior_values.rolling(30, min_periods=30).mean()

    frame["net_cash_flow_lag_1"] = frame[TARGET].shift(1)
    frame["net_cash_flow_lag_7"] = frame[TARGET].shift(7)
    frame["day_of_week"] = frame["date"].dt.dayofweek
    frame["day_of_month"] = frame["date"].dt.day
    frame["month"] = frame["date"].dt.month
    frame["days_since_series_start"] = (frame["date"] - frame["date"].min()).dt.days

    return frame.dropna(subset=list(FEATURE_COLUMNS) + [TARGET]).reset_index(drop=True)


def build_future_feature_row(history: pd.DataFrame, forecast_date: pd.Timestamp) -> dict[str, float | int]:
    """Build one recursive forecast row using only actual or earlier predicted history."""
    if len(history) < 30:
        raise ValueError("At least 30 days of history are required to forecast cash flow.")

    row: dict[str, float | int] = {
        "day_of_week": int(forecast_date.dayofweek),
        "day_of_month": int(forecast_date.day),
        "month": int(forecast_date.month),
        "days_since_series_start": int((forecast_date - history["date"].min()).days),
    }

    for source, suffix in (
        ("cash_inflow", "cash_inflow"),
        ("cash_outflow", "cash_outflow"),
        (TARGET, "net_cash_flow"),
    ):
        # Future inflow/outflow components are deliberately unavailable. Their
        # last observed rolling values stay fixed; net-flow lags update as each
        # prediction is appended below.
        observed = history[source].dropna()
        row[f"{suffix}_rolling_7"] = float(observed.tail(7).mean())
        row[f"{suffix}_rolling_30"] = float(observed.tail(30).mean())

    net_history = history[TARGET].dropna()
    row["net_cash_flow_lag_1"] = float(net_history.iloc[-1])
    row["net_cash_flow_lag_7"] = float(net_history.iloc[-7])
    return row
