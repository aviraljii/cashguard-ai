from pathlib import Path
import pandas as pd
from ml.src.data.mysql_loader import load_sql_file

ROOT = Path(__file__).resolve().parents[3]
QUERY_PATH = ROOT / "database" / "queries" / "customer_segmentation_features.sql"
FEATURE_COLUMNS = ("total_orders","total_sales_value","average_order_value","purchase_frequency","recency_days","customer_age_days","active_months","recent_30_day_orders","recent_30_day_sales","recent_90_day_orders","recent_90_day_sales","average_days_between_orders","sales_growth_rate")

def load_customer_segmentation_data(customer_id: str | None = None) -> pd.DataFrame:
    data = load_sql_file(QUERY_PATH)
    data["as_of_date"] = pd.to_datetime(data["as_of_date"])
    if customer_id is not None: data = data.loc[data.customer_id.astype(str) == str(customer_id)].copy()
    if data.empty: raise ValueError("Customer was not found.")
    data["sales_growth_rate"] = pd.to_numeric(data["sales_growth_rate"], errors="coerce").fillna(0.0)
    for col in FEATURE_COLUMNS: data[col] = pd.to_numeric(data[col], errors="raise").fillna(0.0)
    if data.customer_id.duplicated().any() or data[list(FEATURE_COLUMNS)].isna().any().any(): raise ValueError("Invalid segmentation dataset.")
    return data
