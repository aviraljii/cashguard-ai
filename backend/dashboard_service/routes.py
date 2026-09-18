from __future__ import annotations

from datetime import date, datetime
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from database import get_database_connection

from .service import DashboardService


# ============================================================================
# ROUTER
# ============================================================================

router = APIRouter(
    prefix="/dashboard",
    tags=["Dashboard"],
)

dashboard_service = DashboardService()


# ============================================================================
# HELPERS
# ============================================================================

def get_cash_flow_date_column(cursor) -> str | None:
    """
    Detect the best date/datetime column from daily_cash_flow.
    """

    cursor.execute(
        """
        SELECT
            COLUMN_NAME,
            DATA_TYPE,
            ORDINAL_POSITION
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'daily_cash_flow'
          AND DATA_TYPE IN (
              'date',
              'datetime',
              'timestamp'
          )
        ORDER BY
            CASE
                WHEN LOWER(COLUMN_NAME) IN (
                    'date',
                    'flow_date',
                    'cash_flow_date',
                    'transaction_date',
                    'business_date',
                    'created_at',
                    'updated_at'
                )
                THEN 0
                ELSE 1
            END,
            ORDINAL_POSITION
        """
    )

    columns = cursor.fetchall() or []

    if not columns:
        return None

    return columns[0]["COLUMN_NAME"]


def serialize_date(value: Any) -> str | None:
    """
    Convert date/datetime values into JSON-safe strings.
    """

    if isinstance(value, (date, datetime)):
        return value.isoformat()

    if value is None:
        return None

    return str(value)


def format_date_label(value: Any) -> str:
    """
    Convert date values into chart-friendly labels.
    Example: 2026-08-27 -> 27 Aug
    """

    if isinstance(value, datetime):
        return value.strftime("%d %b")

    if isinstance(value, date):
        return value.strftime("%d %b")

    if value is None:
        return "Unknown"

    text = str(value)

    if len(text) >= 10:
        try:
            parsed = datetime.fromisoformat(
                text.replace("Z", "+00:00")
            )

            return parsed.strftime("%d %b")

        except ValueError:
            return text[:10]

    return text


# ============================================================================
# COMPLETE DASHBOARD
# ============================================================================

@router.get("")
def get_dashboard() -> dict[str, Any]:
    """
    Return complete dashboard data from MySQL.
    """

    try:
        return dashboard_service.get_dashboard()

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                "Failed to load dashboard data."
            ),
        ) from exc


# ============================================================================
# DASHBOARD SUMMARY
# ============================================================================

@router.get("/summary")
def get_dashboard_summary() -> dict[str, Any]:
    """
    Return dashboard KPI summary from MySQL.
    """

    try:
        return dashboard_service.get_dashboard()

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                "Failed to load dashboard summary."
            ),
        ) from exc


# ============================================================================
# CASH FLOW SUMMARY
# ============================================================================

@router.get("/cash-flow")
def get_dashboard_cash_flow() -> dict[str, Any]:
    """
    Return current aggregated cash-flow information.
    """

    try:
        dashboard = dashboard_service.get_dashboard()

        summary = dashboard.get(
            "summary",
            {},
        )

        return {
            "status": "success",
            "data": summary.get(
                "cash_flow",
                {
                    "inflow": 0,
                    "outflow": 0,
                    "net": 0,
                },
            ),
        }

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                "Failed to load cash-flow data."
            ),
        ) from exc


# ============================================================================
# CASH FLOW HISTORY
# ============================================================================

@router.get("/cash-flow/history")
def get_cash_flow_history(
    days: int = Query(
        default=30,
        ge=1,
        le=365,
        description=(
            "Number of recent cash-flow records to return."
        ),
    ),
) -> dict[str, Any]:
    """
    Return historical cash-flow data.

    Future-dated rows are excluded automatically.
    Results are returned oldest -> newest for chart rendering.
    """

    try:
        with get_database_connection() as connection:

            cursor = connection.cursor(
                dictionary=True
            )

            try:
                # ------------------------------------------------------------
                # Detect actual date column
                # ------------------------------------------------------------

                date_column = get_cash_flow_date_column(
                    cursor
                )

                # ------------------------------------------------------------
                # No date column
                # ------------------------------------------------------------

                if date_column is None:
                    return {
                        "status": "success",
                        "days": days,
                        "count": 0,
                        "date_column": None,
                        "data": [],
                        "message": (
                            "No date/datetime column was found "
                            "in daily_cash_flow."
                        ),
                    }

                # ------------------------------------------------------------
                # Historical query
                #
                # Important:
                # Future dates are excluded using CURRENT_DATE.
                # ------------------------------------------------------------

                query = f"""
                    SELECT
                        `{date_column}` AS flow_date,

                        COALESCE(
                            cash_inflow,
                            0
                        ) AS cash_inflow,

                        COALESCE(
                            cash_outflow,
                            0
                        ) AS cash_outflow,

                        COALESCE(
                            net_cash_flow,
                            0
                        ) AS net_cash_flow

                    FROM daily_cash_flow

                    WHERE `{date_column}` <= CURRENT_DATE

                    ORDER BY `{date_column}` DESC

                    LIMIT %s
                """

                cursor.execute(
                    query,
                    (days,),
                )

                rows = cursor.fetchall() or []

                # ------------------------------------------------------------
                # Reverse for chart:
                # oldest -> newest
                # ------------------------------------------------------------

                rows.reverse()

                history: list[dict[str, Any]] = []

                for row in rows:
                    flow_date = row.get(
                        "flow_date"
                    )

                    history.append(
                        {
                            "date": serialize_date(
                                flow_date
                            ),
                            "label": format_date_label(
                                flow_date
                            ),
                            "inflow": float(
                                row.get(
                                    "cash_inflow"
                                )
                                or 0
                            ),
                            "outflow": float(
                                row.get(
                                    "cash_outflow"
                                )
                                or 0
                            ),
                            "net": float(
                                row.get(
                                    "net_cash_flow"
                                )
                                or 0
                            ),
                        }
                    )

                return {
                    "status": "success",
                    "days": days,
                    "count": len(history),
                    "date_column": date_column,
                    "data": history,
                }

            finally:
                cursor.close()

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                "Failed to load cash-flow history: "
                f"{str(exc)}"
            ),
        ) from exc


# ============================================================================
# RECENT TRANSACTIONS
# ============================================================================

@router.get("/recent-transactions")
def get_recent_transactions() -> dict[str, Any]:
    """
    Return recent transactions.

    This endpoint is intentionally kept stable for the frontend.
    Actual transaction aggregation will be connected after verifying
    the exact database columns.
    """

    try:
        return {
            "status": "success",
            "data": [],
        }

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                "Failed to load recent transactions."
            ),
        ) from exc


# ============================================================================
# ALERTS
# ============================================================================

@router.get("/alerts")
def get_dashboard_alerts() -> dict[str, Any]:
    """
    Return dashboard alerts.

    Kept as a stable API contract until alert-service/database
    structure is verified.
    """

    try:
        return {
            "status": "success",
            "data": [],
        }

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                "Failed to load dashboard alerts."
            ),
        ) from exc