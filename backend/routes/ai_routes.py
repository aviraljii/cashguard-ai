from __future__ import annotations

import json
import math
import os
from datetime import date, datetime, timedelta
from typing import Any

import pymysql
import requests
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from auth_service.routes.auth import get_authenticated_user
from ollama.service import ollama_service


router = APIRouter(
    prefix="/ai",
    tags=["AI"],
)


# ============================================================
# RUNTIME CACHE
# ============================================================

_TABLE_META_CACHE: dict[
    str,
    tuple[bool, set[str]],
] = {}


# ============================================================
# COMMON HELPERS
# ============================================================


def _safe_text(
    value: Any,
    default: str = "",
    max_length: int = 5000,
) -> str:
    if value is None:
        return default

    try:
        text = str(value).strip()
    except Exception:
        return default

    if not text:
        return default

    return text[:max_length]


def _safe_float(value: Any) -> float:
    try:
        number = float(value)

        if not math.isfinite(number):
            return 0.0

        return number

    except (
        TypeError,
        ValueError,
        OverflowError,
    ):
        return 0.0


def _safe_int(
    value: Any,
    default: int = 0,
) -> int:
    try:
        return int(value)
    except (
        TypeError,
        ValueError,
        OverflowError,
    ):
        return default


def _clamp(
    value: float,
    minimum: float,
    maximum: float,
) -> float:
    return max(
        minimum,
        min(
            maximum,
            value,
        ),
    )


def _normalize_priority(
    value: Any,
    fallback: str = "LOW",
) -> str:
    allowed = {
        "LOW",
        "MEDIUM",
        "HIGH",
        "CRITICAL",
        "POSITIVE",
    }

    priority = _safe_text(
        value,
        fallback,
        30,
    ).upper()

    if priority in allowed:
        return priority

    fallback_priority = _safe_text(
        fallback,
        "LOW",
        30,
    ).upper()

    if fallback_priority in allowed:
        return fallback_priority

    return "LOW"


def _normalize_risk_level(
    value: Any,
    score: float = 0.0,
) -> str:
    text = _safe_text(
        value,
        "",
        50,
    ).upper()

    aliases = {
        "CRITICAL": "CRITICAL",
        "VERY HIGH": "CRITICAL",
        "VERY_HIGH": "CRITICAL",
        "HIGH": "HIGH",
        "MEDIUM": "MEDIUM",
        "MODERATE": "MEDIUM",
        "LOW": "LOW",
        "VERY LOW": "LOW",
        "VERY_LOW": "LOW",
        "MINIMAL": "LOW",
    }

    if text in aliases:
        return aliases[text]

    normalized_score = _safe_float(score)

    if normalized_score >= 0.85:
        return "CRITICAL"

    if normalized_score >= 0.65:
        return "HIGH"

    if normalized_score >= 0.40:
        return "MEDIUM"

    return "LOW"


def _iso_now() -> str:
    return datetime.now().astimezone().isoformat()


def _format_money(value: float) -> float:
    return round(
        _safe_float(value),
        2,
    )


def _month_label(value: date | datetime) -> str:
    return value.strftime("%b")


def _user_value(
    user: Any,
    *names: str,
) -> Any:
    if user is None:
        return None

    if isinstance(user, dict):
        for name in names:
            if name in user:
                return user.get(name)

    for name in names:
        try:
            value = getattr(user, name, None)
        except Exception:
            value = None

        if value is not None:
            return value

    return None


def _assert_authenticated_business_context(
    current_user: Any,
    business_id: str,
) -> None:
    if current_user is None:
        raise HTTPException(
            status_code=401,
            detail="Authentication credentials are required.",
        )

    # Some CashGuard user implementations already carry the active
    # business/company identifier. When present, prevent cross-business
    # access. When absent, preserve compatibility with existing admin
    # sessions and business membership resolution elsewhere.
    bound_business_id = _user_value(
        current_user,
        "business_id",
        "business_uuid",
        "company_id",
    )

    if (
        bound_business_id is not None
        and str(bound_business_id) != business_id
    ):
        raise HTTPException(
            status_code=403,
            detail="You are not authorized to access this business.",
        )


# ============================================================
# DATABASE CONFIG / CONNECTION
# ============================================================


def _get_db_config() -> dict[str, Any]:
    return {
        "host": os.getenv(
            "DB_HOST",
            "127.0.0.1",
        ),
        "port": _safe_int(
            os.getenv(
                "DB_PORT",
                "3306",
            ),
            3306,
        ),
        "database": os.getenv(
            "DB_NAME",
            "cashguard_ai",
        ),
        "user": os.getenv(
            "DB_USER",
            "root",
        ),
        "password": os.getenv(
            "DB_PASSWORD",
            "",
        ),
        "charset": "utf8mb4",
        "cursorclass": pymysql.cursors.DictCursor,
        "autocommit": True,
        "connect_timeout": 5,
        "read_timeout": 20,
        "write_timeout": 20,
    }


def _get_db_connection():
    return pymysql.connect(
        **_get_db_config(),
    )


# ============================================================
# DATABASE METADATA
# ============================================================


def _get_table_meta(
    connection,
    table_name: str,
) -> tuple[bool, set[str]]:
    cached = _TABLE_META_CACHE.get(
        table_name
    )

    if cached is not None:
        return cached

    table_exists_sql = """
        SELECT COUNT(*) AS count
        FROM information_schema.tables
        WHERE table_schema = DATABASE()
          AND table_name = %s
    """

    with connection.cursor() as cursor:
        cursor.execute(
            table_exists_sql,
            (table_name,),
        )
        row = cursor.fetchone()

    exists = (
        _safe_int(
            row.get("count", 0)
            if row
            else 0
        )
        > 0
    )

    if not exists:
        result = (
            False,
            set(),
        )
        _TABLE_META_CACHE[
            table_name
        ] = result
        return result

    columns_sql = """
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = %s
    """

    with connection.cursor() as cursor:
        cursor.execute(
            columns_sql,
            (table_name,),
        )
        rows = cursor.fetchall()

    columns = {
        _safe_text(
            row.get("column_name"),
            "",
            255,
        )
        for row in rows
        if row.get("column_name")
    }

    result = (
        True,
        columns,
    )

    _TABLE_META_CACHE[
        table_name
    ] = result

    return result


def _table_exists(
    connection,
    table_name: str,
) -> bool:
    exists, _ = _get_table_meta(
        connection,
        table_name,
    )
    return exists


def _get_table_columns(
    connection,
    table_name: str,
) -> set[str]:
    _, columns = _get_table_meta(
        connection,
        table_name,
    )
    return columns


def _pick_column(
    columns: set[str],
    candidates: list[str],
) -> str | None:
    lowered = {
        column.lower(): column
        for column in columns
    }

    for candidate in candidates:
        actual = lowered.get(
            candidate.lower()
        )

        if actual:
            return actual

    return None


def _execute_scalar(
    connection,
    sql: str,
    params: tuple[Any, ...] = (),
) -> float:
    with connection.cursor() as cursor:
        cursor.execute(
            sql,
            params,
        )
        row = cursor.fetchone()

    if not row:
        return 0.0

    first_value = next(
        iter(row.values()),
        0,
    )

    return _safe_float(
        first_value
    )


def _execute_int(
    connection,
    sql: str,
    params: tuple[Any, ...] = (),
) -> int:
    return int(
        round(
            _execute_scalar(
                connection,
                sql,
                params,
            )
        )
    )


# ============================================================
# GENERIC TABLE HELPERS
# ============================================================


def _find_date_column(
    columns: set[str],
) -> str | None:
    return _pick_column(
        columns,
        [
            "transaction_date",
            "sale_date",
            "invoice_date",
            "expense_date",
            "payment_date",
            "date",
            "created_at",
            "updated_at",
            "due_date",
        ],
    )


def _find_business_column(
    columns: set[str],
) -> str | None:
    return _pick_column(
        columns,
        [
            "business_id",
            "business_uuid",
            "company_id",
        ],
    )


def _find_amount_column(
    columns: set[str],
) -> str | None:
    return _pick_column(
        columns,
        [
            "amount",
            "total_amount",
            "grand_total",
            "net_amount",
            "total",
            "value",
            "price",
            "invoice_total",
            "sale_amount",
            "expense_amount",
            "paid_amount",
        ],
    )


def _find_status_column(
    columns: set[str],
) -> str | None:
    return _pick_column(
        columns,
        [
            "status",
            "payment_status",
            "invoice_status",
        ],
    )


def _build_where_clause(
    *,
    business_column: str | None,
    date_column: str | None,
    business_id: str,
    start_date: date | None,
    end_date: date | None,
    extra_conditions: str = "",
    extra_params: tuple[Any, ...] = (),
) -> tuple[str, tuple[Any, ...]]:
    where_parts: list[str] = []
    params: list[Any] = []

    if business_column:
        where_parts.append(
            f"`{business_column}` = %s"
        )
        params.append(
            business_id
        )

    if start_date and date_column:
        where_parts.append(
            f"DATE(`{date_column}`) >= %s"
        )
        params.append(
            start_date
        )

    if end_date and date_column:
        where_parts.append(
            f"DATE(`{date_column}`) <= %s"
        )
        params.append(
            end_date
        )

    if extra_conditions:
        where_parts.append(
            extra_conditions
        )
        params.extend(
            extra_params
        )

    where_sql = (
        " AND ".join(where_parts)
        if where_parts
        else "1=1"
    )

    return (
        where_sql,
        tuple(params),
    )


def _sum_table_amount(
    connection,
    table_name: str,
    business_id: str,
    start_date: date | None = None,
    end_date: date | None = None,
    extra_conditions: str = "",
    extra_params: tuple[Any, ...] = (),
) -> float:
    if not _table_exists(
        connection,
        table_name,
    ):
        return 0.0

    columns = _get_table_columns(
        connection,
        table_name,
    )

    amount_column = _find_amount_column(
        columns
    )

    if not amount_column:
        return 0.0

    business_column = _find_business_column(
        columns
    )

    date_column = _find_date_column(
        columns
    )

    where_sql, params = _build_where_clause(
        business_column=business_column,
        date_column=date_column,
        business_id=business_id,
        start_date=start_date,
        end_date=end_date,
        extra_conditions=extra_conditions,
        extra_params=extra_params,
    )

    sql = f"""
        SELECT COALESCE(
            SUM(
                COALESCE(
                    `{amount_column}`,
                    0
                )
            ),
            0
        ) AS total
        FROM `{table_name}`
        WHERE {where_sql}
    """

    return _execute_scalar(
        connection,
        sql,
        params,
    )


# ============================================================
# LIVE CASH POSITION
# ============================================================


def _get_cash_position(
    connection,
    business_id: str,
) -> float:
    # --------------------------------------------------------
    # daily_cash_flow
    # --------------------------------------------------------

    table_name = "daily_cash_flow"

    if _table_exists(
        connection,
        table_name,
    ):
        columns = _get_table_columns(
            connection,
            table_name,
        )

        business_column = _find_business_column(
            columns
        )

        balance_column = _pick_column(
            columns,
            [
                "closing_balance",
                "cash_balance",
                "balance",
                "ending_balance",
                "net_cash",
            ],
        )

        date_column = _find_date_column(
            columns
        )

        if balance_column:
            where_parts: list[str] = []
            params: list[Any] = []

            if business_column:
                where_parts.append(
                    f"`{business_column}` = %s"
                )
                params.append(
                    business_id
                )

            where_sql = (
                " AND ".join(where_parts)
                if where_parts
                else "1=1"
            )

            order_sql = (
                f"ORDER BY `{date_column}` DESC"
                if date_column
                else ""
            )

            sql = f"""
                SELECT
                    COALESCE(
                        `{balance_column}`,
                        0
                    ) AS balance
                FROM `{table_name}`
                WHERE {where_sql}
                {order_sql}
                LIMIT 1
            """

            return _execute_scalar(
                connection,
                sql,
                tuple(params),
            )

    # --------------------------------------------------------
    # bank_transactions
    # --------------------------------------------------------

    table_name = "bank_transactions"

    if _table_exists(
        connection,
        table_name,
    ):
        columns = _get_table_columns(
            connection,
            table_name,
        )

        business_column = _find_business_column(
            columns
        )

        amount_column = _find_amount_column(
            columns
        )

        balance_column = _pick_column(
            columns,
            [
                "balance",
                "running_balance",
                "closing_balance",
            ],
        )

        date_column = _find_date_column(
            columns
        )

        if (
            balance_column
            and date_column
        ):
            where_parts: list[str] = []
            params: list[Any] = []

            if business_column:
                where_parts.append(
                    f"`{business_column}` = %s"
                )
                params.append(
                    business_id
                )

            where_sql = (
                " AND ".join(where_parts)
                if where_parts
                else "1=1"
            )

            sql = f"""
                SELECT
                    COALESCE(
                        `{balance_column}`,
                        0
                    ) AS balance
                FROM `{table_name}`
                WHERE {where_sql}
                ORDER BY `{date_column}` DESC
                LIMIT 1
            """

            return _execute_scalar(
                connection,
                sql,
                tuple(params),
            )

        if amount_column:
            incoming_column = _pick_column(
                columns,
                [
                    "credit",
                    "credit_amount",
                    "money_in",
                    "inflow",
                ],
            )

            outgoing_column = _pick_column(
                columns,
                [
                    "debit",
                    "debit_amount",
                    "money_out",
                    "outflow",
                ],
            )

            if (
                incoming_column
                and outgoing_column
            ):
                business_sql = ""
                params: list[Any] = []

                if business_column:
                    business_sql = (
                        f"WHERE `{business_column}` = %s"
                    )
                    params.append(
                        business_id
                    )

                sql = f"""
                    SELECT
                        COALESCE(
                            SUM(
                                COALESCE(
                                    `{incoming_column}`,
                                    0
                                )
                            ),
                            0
                        )
                        -
                        COALESCE(
                            SUM(
                                COALESCE(
                                    `{outgoing_column}`,
                                    0
                                )
                            ),
                            0
                        ) AS balance
                    FROM `{table_name}`
                    {business_sql}
                """

                return _execute_scalar(
                    connection,
                    sql,
                    tuple(params),
                )

    return 0.0


# ============================================================
# MONTHLY TRENDS - OPTIMIZED
# ============================================================


def _get_grouped_monthly_amounts(
    connection,
    table_name: str,
    business_id: str,
    start_month: date,
    end_date: date,
) -> dict[tuple[int, int], float]:
    if not _table_exists(
        connection,
        table_name,
    ):
        return {}

    columns = _get_table_columns(
        connection,
        table_name,
    )

    amount_column = _find_amount_column(
        columns
    )

    date_column = _find_date_column(
        columns
    )

    business_column = _find_business_column(
        columns
    )

    if not amount_column or not date_column:
        return {}

    where_parts = [
        f"DATE(`{date_column}`) >= %s",
        f"DATE(`{date_column}`) <= %s",
    ]

    params: list[Any] = [
        start_month,
        end_date,
    ]

    if business_column:
        where_parts.insert(
            0,
            f"`{business_column}` = %s",
        )
        params.insert(
            0,
            business_id,
        )

    sql = f"""
        SELECT
            YEAR(`{date_column}`) AS year_value,
            MONTH(`{date_column}`) AS month_value,
            COALESCE(
                SUM(
                    COALESCE(
                        `{amount_column}`,
                        0
                    )
                ),
                0
            ) AS total
        FROM `{table_name}`
        WHERE {" AND ".join(where_parts)}
        GROUP BY
            YEAR(`{date_column}`),
            MONTH(`{date_column}`)
    """

    with connection.cursor() as cursor:
        cursor.execute(
            sql,
            tuple(params),
        )
        rows = cursor.fetchall()

    result: dict[
        tuple[int, int],
        float,
    ] = {}

    for row in rows:
        key = (
            _safe_int(
                row.get("year_value")
            ),
            _safe_int(
                row.get("month_value")
            ),
        )

        result[key] = _format_money(
            row.get("total", 0)
        )

    return result


def _get_monthly_trends(
    connection,
    business_id: str,
    months: int = 6,
) -> list[dict[str, Any]]:
    today = date.today()

    first_month_index = (
        today.year * 12
        + (today.month - 1)
        - (months - 1)
    )

    first_year = first_month_index // 12
    first_month = (
        first_month_index % 12
    ) + 1

    start_month = date(
        first_year,
        first_month,
        1,
    )

    sales_values = _get_grouped_monthly_amounts(
        connection,
        "sales",
        business_id,
        start_month,
        today,
    )

    payment_values = _get_grouped_monthly_amounts(
        connection,
        "payments",
        business_id,
        start_month,
        today,
    )

    expense_values = _get_grouped_monthly_amounts(
        connection,
        "expenses",
        business_id,
        start_month,
        today,
    )

    trends: list[dict[str, Any]] = []

    for offset in range(
        months - 1,
        -1,
        -1,
    ):
        month_index = (
            today.year * 12
            + (today.month - 1)
            - offset
        )

        year = month_index // 12
        month = (
            month_index % 12
        ) + 1

        month_start = date(
            year,
            month,
            1,
        )

        key = (
            year,
            month,
        )

        revenue = sales_values.get(
            key,
            0.0,
        )

        if revenue == 0:
            revenue = payment_values.get(
                key,
                0.0,
            )

        expenses = expense_values.get(
            key,
            0.0,
        )

        cash = (
            revenue
            - expenses
        )

        trends.append(
            {
                "month": _month_label(
                    month_start
                ),
                "revenue": _format_money(
                    revenue
                ),
                "expenses": _format_money(
                    expenses
                ),
                "cash": _format_money(
                    cash
                ),
            }
        )

    return trends


# ============================================================
# LIVE RECEIVABLES
# ============================================================


def _get_receivable_metrics(
    connection,
    business_id: str,
) -> dict[str, Any]:
    table_name = "invoices"

    default_response = {
        "outstanding": 0.0,
        "outstanding_count": 0,
        "overdue": 0.0,
        "overdue_count": 0,
        "due_soon": 0.0,
    }

    if not _table_exists(
        connection,
        table_name,
    ):
        return default_response

    columns = _get_table_columns(
        connection,
        table_name,
    )

    business_column = _find_business_column(
        columns
    )

    total_column = _pick_column(
        columns,
        [
            "total_amount",
            "grand_total",
            "invoice_total",
            "amount",
            "total",
        ],
    )

    paid_column = _pick_column(
        columns,
        [
            "paid_amount",
            "amount_paid",
            "received_amount",
        ],
    )

    remaining_column = _pick_column(
        columns,
        [
            "balance_due",
            "remaining_amount",
            "outstanding_amount",
            "due_amount",
        ],
    )

    due_date_column = _pick_column(
        columns,
        [
            "due_date",
            "payment_due_date",
            "expected_payment_date",
        ],
    )

    status_column = _find_status_column(
        columns
    )

    where_parts: list[str] = []
    params: list[Any] = []

    if business_column:
        where_parts.append(
            f"`{business_column}` = %s"
        )
        params.append(
            business_id
        )

    if status_column:
        where_parts.append(
            f"""
            LOWER(
                COALESCE(
                    `{status_column}`,
                    ''
                )
            ) NOT IN (
                'paid',
                'cancelled',
                'canceled'
            )
            """
        )

    base_where = (
        " AND ".join(where_parts)
        if where_parts
        else "1=1"
    )

    if remaining_column:
        outstanding_expression = (
            f"GREATEST(COALESCE(`{remaining_column}`, 0), 0)"
        )
    elif total_column and paid_column:
        outstanding_expression = (
            "GREATEST("
            f"COALESCE(`{total_column}`, 0)"
            " - "
            f"COALESCE(`{paid_column}`, 0)"
            ", 0)"
        )
    elif total_column:
        outstanding_expression = (
            f"GREATEST(COALESCE(`{total_column}`, 0), 0)"
        )
    else:
        outstanding_expression = "0"

    outstanding_sql = f"""
        SELECT
            COALESCE(
                SUM(
                    {outstanding_expression}
                ),
                0
            ) AS outstanding,
            COUNT(
                CASE
                    WHEN {outstanding_expression} > 0
                    THEN 1
                END
            ) AS invoice_count
        FROM `{table_name}`
        WHERE {base_where}
    """

    with connection.cursor() as cursor:
        cursor.execute(
            outstanding_sql,
            tuple(params),
        )
        outstanding_row = (
            cursor.fetchone()
            or {}
        )

    outstanding = _safe_float(
        outstanding_row.get(
            "outstanding",
            0,
        )
    )

    outstanding_count = _safe_int(
        outstanding_row.get(
            "invoice_count",
            0,
        )
    )

    overdue = 0.0
    overdue_count = 0
    due_soon = 0.0

    if due_date_column:
        overdue_sql = f"""
            SELECT
                COALESCE(
                    SUM(
                        CASE
                            WHEN DATE(
                                `{due_date_column}`
                            ) < CURDATE()
                            AND {outstanding_expression} > 0
                            THEN {outstanding_expression}
                            ELSE 0
                        END
                    ),
                    0
                ) AS overdue,

                COUNT(
                    CASE
                        WHEN DATE(
                            `{due_date_column}`
                        ) < CURDATE()
                        AND {outstanding_expression} > 0
                        THEN 1
                    END
                ) AS overdue_count,

                COALESCE(
                    SUM(
                        CASE
                            WHEN DATE(
                                `{due_date_column}`
                            ) BETWEEN
                                CURDATE()
                                AND DATE_ADD(
                                    CURDATE(),
                                    INTERVAL 7 DAY
                                )
                            AND {outstanding_expression} > 0
                            THEN {outstanding_expression}
                            ELSE 0
                        END
                    ),
                    0
                ) AS due_soon

            FROM `{table_name}`
            WHERE {base_where}
        """

        with connection.cursor() as cursor:
            cursor.execute(
                overdue_sql,
                tuple(params),
            )
            overdue_row = (
                cursor.fetchone()
                or {}
            )

        overdue = _safe_float(
            overdue_row.get(
                "overdue",
                0,
            )
        )

        overdue_count = _safe_int(
            overdue_row.get(
                "overdue_count",
                0,
            )
        )

        due_soon = _safe_float(
            overdue_row.get(
                "due_soon",
                0,
            )
        )

    return {
        "outstanding": _format_money(
            outstanding
        ),
        "outstanding_count": outstanding_count,
        "overdue": _format_money(
            overdue
        ),
        "overdue_count": overdue_count,
        "due_soon": _format_money(
            due_soon
        ),
    }


# ============================================================
# PERSISTED ML RISK SUMMARY
# ============================================================


def _parse_signal_items(
    value: Any,
) -> list[str]:
    if value is None:
        return []

    if isinstance(
        value,
        list,
    ):
        result: list[str] = []

        for item in value:
            text = _safe_text(
                item,
                "",
                500,
            )

            if text:
                result.append(
                    text
                )

        return result[:20]

    text = _safe_text(
        value,
        "",
        5000,
    )

    if not text:
        return []

    try:
        parsed = json.loads(
            text
        )

        if isinstance(
            parsed,
            list,
        ):
            return _parse_signal_items(
                parsed
            )

        if isinstance(
            parsed,
            dict,
        ):
            values: list[str] = []

            for key in (
                "signals",
                "risk_signals",
                "reasons",
                "flags",
            ):
                candidate = parsed.get(
                    key
                )

                if isinstance(
                    candidate,
                    list,
                ):
                    values.extend(
                        _parse_signal_items(
                            candidate
                        )
                    )

                elif candidate:
                    signal_text = _safe_text(
                        candidate,
                        "",
                        500,
                    )

                    if signal_text:
                        values.append(
                            signal_text
                        )

            return values[:20]

    except (
        json.JSONDecodeError,
        TypeError,
    ):
        pass

    return [
        item.strip()
        for item in text.replace(
            "|",
            ",",
        ).split(",")
        if item.strip()
    ][:20]


def _get_persisted_ml_risk_summary(
    connection,
    business_id: str,
) -> dict[str, Any]:
    empty_summary = {
        "available": False,
        "total_predictions": 0,
        "high_risk_count": 0,
        "critical_risk_count": 0,
        "medium_risk_count": 0,
        "low_risk_count": 0,
        "average_risk_score": 0.0,
        "highest_risk_score": 0.0,
        "latest_model_version": "",
        "latest_prediction_source": "",
        "priority_signals": [],
        "latest_risk_level": "LOW",
    }

    risk_table = "risk_results"

    if not _table_exists(
        connection,
        risk_table,
    ):
        return empty_summary

    columns = _get_table_columns(
        connection,
        risk_table,
    )

    if not columns:
        return empty_summary

    risk_score_column = _pick_column(
        columns,
        [
            "risk_score",
            "score",
            "risk_probability",
            "probability",
            "risk",
        ],
    )

    risk_level_column = _pick_column(
        columns,
        [
            "risk_level",
            "risk_category",
            "level",
            "risk_class",
        ],
    )

    model_version_column = _pick_column(
        columns,
        [
            "model_version",
            "model",
            "version",
        ],
    )

    source_column = _pick_column(
        columns,
        [
            "source",
            "prediction_source",
            "model_source",
        ],
    )

    signal_column = _pick_column(
        columns,
        [
            "signals",
            "risk_signals",
            "reasons",
            "flags",
        ],
    )

    created_column = _pick_column(
        columns,
        [
            "created_at",
            "predicted_at",
            "prediction_date",
            "updated_at",
        ],
    )

    business_column = _find_business_column(
        columns
    )

    payment_id_column = _pick_column(
        columns,
        [
            "payment_id",
        ],
    )

    total_predictions = 0
    high_risk_count = 0
    critical_risk_count = 0
    medium_risk_count = 0
    low_risk_count = 0
    average_score = 0.0
    highest_score = 0.0
    priority_signals: list[str] = []
    latest_model_version = ""
    latest_prediction_source = ""
    latest_risk_level = "LOW"

    if business_column:
        where_sql = (
            f"`{business_column}` = %s"
        )

        params = (
            business_id,
        )

        total_sql = f"""
            SELECT COUNT(*) AS total
            FROM `{risk_table}`
            WHERE {where_sql}
        """

        total_predictions = _execute_int(
            connection,
            total_sql,
            params,
        )

        if risk_score_column:
            score_sql = f"""
                SELECT
                    COALESCE(
                        AVG(
                            COALESCE(
                                `{risk_score_column}`,
                                0
                            )
                        ),
                        0
                    ) AS average_score,
                    COALESCE(
                        MAX(
                            COALESCE(
                                `{risk_score_column}`,
                                0
                            )
                        ),
                        0
                    ) AS highest_score
                FROM `{risk_table}`
                WHERE {where_sql}
            """

            with connection.cursor() as cursor:
                cursor.execute(
                    score_sql,
                    params,
                )
                score_row = (
                    cursor.fetchone()
                    or {}
                )

            average_score = _safe_float(
                score_row.get(
                    "average_score",
                    0,
                )
            )

            highest_score = _safe_float(
                score_row.get(
                    "highest_score",
                    0,
                )
            )

        if risk_level_column:
            level_sql = f"""
                SELECT
                    LOWER(
                        COALESCE(
                            `{risk_level_column}`,
                            ''
                        )
                    ) AS risk_level,
                    COUNT(*) AS total
                FROM `{risk_table}`
                WHERE {where_sql}
                GROUP BY LOWER(
                    COALESCE(
                        `{risk_level_column}`,
                        ''
                    )
                )
            """

            with connection.cursor() as cursor:
                cursor.execute(
                    level_sql,
                    params,
                )
                level_rows = (
                    cursor.fetchall()
                )

            for row in level_rows:
                level = _normalize_risk_level(
                    row.get(
                        "risk_level"
                    )
                )

                count = _safe_int(
                    row.get(
                        "total",
                        0,
                    )
                )

                if level == "CRITICAL":
                    critical_risk_count += count
                elif level == "HIGH":
                    high_risk_count += count
                elif level == "MEDIUM":
                    medium_risk_count += count
                else:
                    low_risk_count += count

        order_sql = ""

        if created_column:
            order_sql = (
                f"ORDER BY "
                f"`{created_column}` DESC"
            )

        select_columns: list[str] = []

        if risk_score_column:
            select_columns.append(
                f"`{risk_score_column}` AS risk_score"
            )

        if risk_level_column:
            select_columns.append(
                f"`{risk_level_column}` AS risk_level"
            )

        if model_version_column:
            select_columns.append(
                f"`{model_version_column}` AS model_version"
            )

        if source_column:
            select_columns.append(
                f"`{source_column}` AS prediction_source"
            )

        if signal_column:
            select_columns.append(
                f"`{signal_column}` AS risk_signals"
            )

        if not select_columns:
            select_columns.append(
                "1 AS available_row"
            )

        latest_sql = f"""
            SELECT
                {", ".join(select_columns)}
            FROM `{risk_table}`
            WHERE {where_sql}
            {order_sql}
            LIMIT 1
        """

        with connection.cursor() as cursor:
            cursor.execute(
                latest_sql,
                params,
            )
            latest_row = (
                cursor.fetchone()
                or {}
            )

        latest_risk_level = _normalize_risk_level(
            latest_row.get(
                "risk_level"
            ),
            _safe_float(
                latest_row.get(
                    "risk_score",
                    0,
                )
            ),
        )

        latest_model_version = _safe_text(
            latest_row.get(
                "model_version"
            ),
            "",
            200,
        )

        latest_prediction_source = _safe_text(
            latest_row.get(
                "prediction_source"
            ),
            "",
            200,
        )

        priority_signals = _parse_signal_items(
            latest_row.get(
                "risk_signals"
            )
        )

    elif (
        payment_id_column
        and _table_exists(
            connection,
            "payments",
        )
    ):
        payment_columns = _get_table_columns(
            connection,
            "payments",
        )

        payment_pk = _pick_column(
            payment_columns,
            [
                "id",
                "payment_id",
                "uuid",
            ],
        )

        payment_business_column = _find_business_column(
            payment_columns
        )

        if (
            payment_pk
            and payment_business_column
        ):
            join_on = (
                f"r.`{payment_id_column}` = "
                f"p.`{payment_pk}`"
            )

            where_sql = (
                f"p.`{payment_business_column}` = %s"
            )

            params = (
                business_id,
            )

            total_sql = f"""
                SELECT COUNT(*) AS total
                FROM `{risk_table}` r
                INNER JOIN `payments` p
                    ON {join_on}
                WHERE {where_sql}
            """

            total_predictions = _execute_int(
                connection,
                total_sql,
                params,
            )

            if risk_score_column:
                score_sql = f"""
                    SELECT
                        COALESCE(
                            AVG(
                                COALESCE(
                                    r.`{risk_score_column}`,
                                    0
                                )
                            ),
                            0
                        ) AS average_score,
                        COALESCE(
                            MAX(
                                COALESCE(
                                    r.`{risk_score_column}`,
                                    0
                                )
                            ),
                            0
                        ) AS highest_score
                    FROM `{risk_table}` r
                    INNER JOIN `payments` p
                        ON {join_on}
                    WHERE {where_sql}
                """

                with connection.cursor() as cursor:
                    cursor.execute(
                        score_sql,
                        params,
                    )
                    score_row = (
                        cursor.fetchone()
                        or {}
                    )

                average_score = _safe_float(
                    score_row.get(
                        "average_score",
                        0,
                    )
                )

                highest_score = _safe_float(
                    score_row.get(
                        "highest_score",
                        0,
                    )
                )

            if risk_level_column:
                level_sql = f"""
                    SELECT
                        LOWER(
                            COALESCE(
                                r.`{risk_level_column}`,
                                ''
                            )
                        ) AS risk_level,
                        COUNT(*) AS total
                    FROM `{risk_table}` r
                    INNER JOIN `payments` p
                        ON {join_on}
                    WHERE {where_sql}
                    GROUP BY LOWER(
                        COALESCE(
                            r.`{risk_level_column}`,
                            ''
                        )
                    )
                """

                with connection.cursor() as cursor:
                    cursor.execute(
                        level_sql,
                        params,
                    )
                    level_rows = (
                        cursor.fetchall()
                    )

                for row in level_rows:
                    level = _normalize_risk_level(
                        row.get(
                            "risk_level"
                        )
                    )

                    count = _safe_int(
                        row.get(
                            "total",
                            0,
                        )
                    )

                    if level == "CRITICAL":
                        critical_risk_count += count
                    elif level == "HIGH":
                        high_risk_count += count
                    elif level == "MEDIUM":
                        medium_risk_count += count
                    else:
                        low_risk_count += count

            order_sql = ""

            if created_column:
                order_sql = (
                    f"ORDER BY "
                    f"r.`{created_column}` DESC"
                )

            select_columns = []

            if risk_score_column:
                select_columns.append(
                    f"r.`{risk_score_column}` AS risk_score"
                )

            if risk_level_column:
                select_columns.append(
                    f"r.`{risk_level_column}` AS risk_level"
                )

            if model_version_column:
                select_columns.append(
                    f"r.`{model_version_column}` AS model_version"
                )

            if source_column:
                select_columns.append(
                    f"r.`{source_column}` AS prediction_source"
                )

            if signal_column:
                select_columns.append(
                    f"r.`{signal_column}` AS risk_signals"
                )

            if not select_columns:
                select_columns.append(
                    "1 AS available_row"
                )

            latest_sql = f"""
                SELECT
                    {", ".join(select_columns)}
                FROM `{risk_table}` r
                INNER JOIN `payments` p
                    ON {join_on}
                WHERE {where_sql}
                {order_sql}
                LIMIT 1
            """

            with connection.cursor() as cursor:
                cursor.execute(
                    latest_sql,
                    params,
                )
                latest_row = (
                    cursor.fetchone()
                    or {}
                )

            latest_risk_level = _normalize_risk_level(
                latest_row.get(
                    "risk_level"
                ),
                _safe_float(
                    latest_row.get(
                        "risk_score",
                        0,
                    )
                ),
            )

            latest_model_version = _safe_text(
                latest_row.get(
                    "model_version"
                ),
                "",
                200,
            )

            latest_prediction_source = _safe_text(
                latest_row.get(
                    "prediction_source"
                ),
                "",
                200,
            )

            priority_signals = _parse_signal_items(
                latest_row.get(
                    "risk_signals"
                )
            )

    return {
        "available": total_predictions > 0,
        "total_predictions": total_predictions,
        "high_risk_count": high_risk_count,
        "critical_risk_count": critical_risk_count,
        "medium_risk_count": medium_risk_count,
        "low_risk_count": low_risk_count,
        "average_risk_score": round(
            average_score,
            4,
        ),
        "highest_risk_score": round(
            highest_score,
            4,
        ),
        "latest_model_version": latest_model_version,
        "latest_prediction_source": latest_prediction_source,
        "priority_signals": priority_signals[:10],
        "latest_risk_level": latest_risk_level,
    }


# ============================================================
# FINANCIAL HEALTH
# ============================================================


def _calculate_financial_health(
    *,
    current_cash: float,
    net_cash_flow: float,
    overdue_receivables: float,
    outstanding_receivables: float,
    recent_revenue: float,
    recent_expenses: float,
    risk_signals: int,
    ml_high_risk_count: int = 0,
    ml_critical_risk_count: int = 0,
) -> tuple[int, str]:
    score = 70.0

    if current_cash > 0:
        score += 8
    else:
        score -= 10

    if net_cash_flow > 0:
        score += 8
    elif net_cash_flow < 0:
        score -= 12

    if recent_revenue > recent_expenses:
        score += 7
    elif recent_expenses > recent_revenue:
        score -= 8

    if outstanding_receivables > 0:
        overdue_ratio = (
            overdue_receivables
            / outstanding_receivables
        )

        if overdue_ratio < 0.15:
            score += 4
        elif overdue_ratio > 0.50:
            score -= 12
        elif overdue_ratio > 0.30:
            score -= 7

    score -= min(
        risk_signals * 4,
        20,
    )

    score -= min(
        ml_high_risk_count * 2,
        10,
    )

    score -= min(
        ml_critical_risk_count * 5,
        15,
    )

    score = _clamp(
        score,
        0,
        100,
    )

    if score >= 80:
        label = "Healthy"
    elif score >= 65:
        label = "Stable"
    elif score >= 50:
        label = "Watch"
    else:
        label = "At Risk"

    return (
        round(score),
        label,
    )


# ============================================================
# FINANCIAL RISK SIGNALS
# ============================================================


def _calculate_risk_signals(
    *,
    current_cash: float,
    net_cash_flow: float,
    overdue_receivables: float,
    outstanding_receivables: float,
    projected_lowest_balance: float,
    recent_revenue: float,
    recent_expenses: float,
    ml_risk_summary: dict[str, Any] | None = None,
) -> tuple[int, int, list[dict[str, Any]]]:
    signals: list[dict[str, Any]] = []

    overdue_ratio = 0.0

    if outstanding_receivables > 0:
        overdue_ratio = (
            overdue_receivables
            / outstanding_receivables
        )

    if overdue_receivables > 0:
        priority = (
            "HIGH"
            if overdue_ratio >= 0.30
            else "MEDIUM"
        )

        signals.append(
            {
                "id": "receivables-risk",
                "title": "Receivables require attention",
                "category": "Customers",
                "priority": priority,
                "summary": (
                    "A portion of outstanding customer "
                    "receivables is overdue."
                ),
                "metric": _format_money(
                    overdue_receivables
                ),
                "metric_label": "overdue receivables",
                "impact": (
                    "Delayed collections can reduce "
                    "near-term operating liquidity."
                ),
                "recommendation": (
                    "Prioritize the highest-value overdue "
                    "receivables and follow up on collections."
                ),
                "action": "Review Customers",
                "related_entity":
                    "Outstanding customer receivables",
                "related_route": "/customers",
                "confidence": 88,
                "created_at": _iso_now(),
                "reviewed": False,
                "saved": False,
            }
        )

    if net_cash_flow < 0:
        priority = (
            "HIGH"
            if current_cash <= 0
            else "MEDIUM"
        )

        signals.append(
            {
                "id": "negative-cash-flow",
                "title": "Net cash flow is negative",
                "category": "Cash Flow",
                "priority": priority,
                "summary": (
                    "Recent recorded cash outflows "
                    "are greater than inflows."
                ),
                "metric": _format_money(
                    abs(net_cash_flow)
                ),
                "metric_label": "negative net cash flow",
                "impact": (
                    "Persistent negative cash flow "
                    "can reduce the cash buffer."
                ),
                "recommendation": (
                    "Review major outflows and "
                    "accelerate confirmed collections."
                ),
                "action": "Review Cash Flow",
                "related_entity":
                    "Recent operating cash flow",
                "related_route": "/cash-flow",
                "confidence": 90,
                "created_at": _iso_now(),
                "reviewed": False,
                "saved": False,
            }
        )

    if projected_lowest_balance < 0:
        signals.append(
            {
                "id": "forecast-shortfall",
                "title": "Estimated cash shortfall",
                "category": "Risk",
                "priority": "CRITICAL",
                "summary": (
                    "The deterministic cash run-rate estimate "
                    "reaches a negative projected balance."
                ),
                "metric": _format_money(
                    abs(projected_lowest_balance)
                ),
                "metric_label": "estimated projected shortfall",
                "impact": (
                    "A negative estimated balance may "
                    "put upcoming obligations under pressure."
                ),
                "recommendation": (
                    "Accelerate collections and review "
                    "upcoming outflows before committing cash."
                ),
                "action": "Review Cash Forecast",
                "related_entity":
                    "Cash-flow run-rate estimate",
                "related_route": "/cash-flow",
                "confidence": 82,
                "created_at": _iso_now(),
                "reviewed": False,
                "saved": False,
            }
        )

    if (
        recent_expenses > 0
        and recent_revenue < recent_expenses
    ):
        signals.append(
            {
                "id": "expense-pressure",
                "title": "Expenses are above recent revenue",
                "category": "Expenses",
                "priority": "MEDIUM",
                "summary": (
                    "Recent recorded expenses are above "
                    "recorded revenue."
                ),
                "metric": _format_money(
                    recent_expenses
                    - recent_revenue
                ),
                "metric_label": "expense pressure",
                "impact": (
                    "Sustained expense pressure can "
                    "narrow the operating cash buffer."
                ),
                "recommendation": (
                    "Review recurring costs and "
                    "non-essential spending."
                ),
                "action": "Review Expenses",
                "related_entity":
                    "Recent operating expenses",
                "related_route": "/analytics",
                "confidence": 86,
                "created_at": _iso_now(),
                "reviewed": False,
                "saved": False,
            }
        )

    ml_risk_summary = (
        ml_risk_summary
        or {}
    )

    ml_critical = _safe_int(
        ml_risk_summary.get(
            "critical_risk_count",
            0,
        )
    )

    ml_high = _safe_int(
        ml_risk_summary.get(
            "high_risk_count",
            0,
        )
    )

    ml_average = _safe_float(
        ml_risk_summary.get(
            "average_risk_score",
            0,
        )
    )

    priority_ml_signals = (
        ml_risk_summary.get(
            "priority_signals",
            [],
        )
    )

    if not isinstance(
        priority_ml_signals,
        list,
    ):
        priority_ml_signals = []

    if (
        ml_critical > 0
        or ml_high > 0
    ):
        total_high_risk = (
            ml_critical
            + ml_high
        )

        priority = (
            "CRITICAL"
            if ml_critical > 0
            else "HIGH"
        )

        model_name = _safe_text(
            ml_risk_summary.get(
                "latest_model_version"
            ),
            "CashGuard RiskPredictor",
            200,
        )

        signal_text = ", ".join(
            [
                _safe_text(
                    value,
                    "",
                    300,
                )
                for value in priority_ml_signals[:3]
                if _safe_text(
                    value,
                    "",
                    300,
                )
            ]
        )

        summary = (
            f"The persisted ML risk engine has "
            f"{total_high_risk} high-priority payment-risk "
            f"prediction(s)."
        )

        if signal_text:
            summary += (
                f" Latest model signals: {signal_text}."
            )

        signals.append(
            {
                "id": "ml-payment-risk",
                "title":
                    "ML payment risk requires attention",
                "category": "Risk",
                "priority": priority,
                "summary": summary,
                "metric": total_high_risk,
                "metric_label":
                    "high-priority ML risk predictions",
                "impact": (
                    "High-risk payment predictions may "
                    "increase collection uncertainty."
                ),
                "recommendation": (
                    "Prioritize customers associated with "
                    "high-risk payment predictions."
                ),
                "action": "Review Payment Risk",
                "related_entity": model_name,
                "related_route": "/risk",
                "ml_average_risk_score":
                    ml_average,
                "confidence": 91,
                "created_at": _iso_now(),
                "reviewed": False,
                "saved": False,
            }
        )

    high_priority_count = sum(
        1
        for signal in signals
        if signal.get("priority")
        in {
            "HIGH",
            "CRITICAL",
        }
    )

    return (
        len(signals),
        high_priority_count,
        signals,
    )


# ============================================================
# LLM JSON EXTRACTION
# ============================================================


def _extract_json_from_llm(
    response_text: str,
) -> dict[str, Any]:
    text = _safe_text(
        response_text,
        "",
        40000,
    )

    if not text:
        return {}

    try:
        parsed = json.loads(
            text
        )

        if isinstance(
            parsed,
            dict,
        ):
            return parsed

    except (
        json.JSONDecodeError,
        TypeError,
    ):
        pass

    cleaned = text.strip()

    if cleaned.startswith(
        "```"
    ):
        lines = cleaned.splitlines()

        if lines:
            first_line = (
                lines[0]
                .strip()
                .lower()
            )

            if first_line in {
                "```",
                "```json",
            }:
                lines = lines[1:]

        if (
            lines
            and lines[-1].strip()
            == "```"
        ):
            lines = lines[:-1]

        cleaned = (
            "\n".join(lines)
            .strip()
        )

        try:
            parsed = json.loads(
                cleaned
            )

            if isinstance(
                parsed,
                dict,
            ):
                return parsed

        except (
            json.JSONDecodeError,
            TypeError,
        ):
            pass

    start = text.find("{")
    end = text.rfind("}")

    if (
        start >= 0
        and end > start
    ):
        candidate = text[
            start:end + 1
        ].strip()

        try:
            parsed = json.loads(
                candidate
            )

            if isinstance(
                parsed,
                dict,
            ):
                return parsed

        except (
            json.JSONDecodeError,
            TypeError,
        ):
            pass

    return {}


# ============================================================
# GENERIC AI CHAT
# ============================================================


class AIChatRequest(BaseModel):
    prompt: str = Field(
        ...,
        min_length=1,
        max_length=10000,
    )

    system_prompt: str | None = Field(
        default=None,
        max_length=5000,
    )


class AIChatResponse(BaseModel):
    success: bool
    model: str
    response: str
    done: bool


@router.post(
    "/chat",
    response_model=AIChatResponse,
)
def ai_chat(
    request: AIChatRequest,
) -> AIChatResponse:
    try:
        result = ollama_service.generate(
            prompt=request.prompt,
            system_prompt=request.system_prompt,
        )

        if not isinstance(
            result,
            dict,
        ):
            raise RuntimeError(
                "Ollama service returned an invalid response."
            )

        model = _safe_text(
            result.get("model"),
            "unknown",
            200,
        )

        response_text = _safe_text(
            result.get("response"),
            "",
            20000,
        )

        return AIChatResponse(
            success=True,
            model=model,
            response=response_text,
            done=bool(
                result.get(
                    "done",
                    True,
                )
            ),
        )

    except requests.RequestException as exc:
        raise HTTPException(
            status_code=502,
            detail="Ollama AI service is temporarily unavailable.",
        ) from exc

    except HTTPException:
        raise

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="AI service could not process the request.",
        ) from exc


# ============================================================
# CASH FLOW AI INSIGHT
# ============================================================


class CashFlowInsightRequest(BaseModel):
    business_id: str = Field(
        ...,
        min_length=1,
        max_length=100,
    )

    planning_horizon_days: int = Field(
        default=14,
        ge=1,
        le=365,
    )

    current_cash: float = 0.0
    money_in: float = 0.0
    money_out: float = 0.0
    net_cash_flow: float = 0.0

    receivables: float = 0.0
    overdue_receivables: float = 0.0
    due_soon_collections: float = 0.0

    projected_inflow: float = 0.0
    projected_outflow: float = 0.0
    projected_net: float = 0.0
    projected_lowest_balance: float = 0.0

    shortfall_risk: str = Field(
        default="LOW",
        min_length=1,
        max_length=20,
    )

    health_score: float = Field(
        default=0.0,
        ge=0,
        le=100,
    )


class CashFlowInsightResponse(BaseModel):
    success: bool
    domain: str
    model: str
    insight: dict[str, Any]


def _normalise_insight(
    data: dict[str, Any],
    request: CashFlowInsightRequest,
) -> dict[str, Any]:
    risk = _normalize_priority(
        request.shortfall_risk,
        "LOW",
    )

    return {
        "type": _safe_text(
            data.get("type"),
            "Cash Flow Insight",
            200,
        ),
        "title": _safe_text(
            data.get("title"),
            "Cash Flow Intelligence",
            500,
        ),
        "explanation": _safe_text(
            data.get(
                "explanation",
                data.get(
                    "summary",
                    "",
                ),
            ),
            "",
            5000,
        ),
        "evidence": _safe_text(
            data.get("evidence"),
            (
                "Based on the supplied live "
                "cash-flow intelligence."
            ),
            5000,
        ),
        "recommendation": _safe_text(
            data.get(
                "recommendation",
                data.get(
                    "recommendations",
                    "",
                ),
            ),
            "",
            5000,
        ),
        "action": _safe_text(
            data.get("action"),
            "Review Cash Flow",
            500,
        ),
        "priority": _normalize_priority(
            data.get(
                "priority",
                risk,
            ),
            risk,
        ),
        "confidence_note": _safe_text(
            data.get(
                "confidence_note"
            ),
            (
                "Insight is based on supplied "
                "live cash-flow intelligence."
            ),
            3000,
        ),
    }


def _build_fallback_insight(
    current_cash: float,
    money_in: float,
    money_out: float,
    net_cash_flow: float,
    receivables: float,
    overdue_receivables: float,
    due_soon_collections: float,
    projected_inflow: float,
    projected_outflow: float,
    projected_net: float,
    projected_lowest_balance: float,
    health_score: float,
    risk: str,
) -> dict[str, Any]:
    if risk == "CRITICAL":
        title = "Critical Cash Flow Risk"

        explanation = (
            f"Current cash is ₹{current_cash:,.2f}. "
            f"Net cash flow is ₹{net_cash_flow:,.2f} "
            f"and overdue receivables are "
            f"₹{overdue_receivables:,.2f}."
        )

        recommendation = (
            "Prioritize overdue collections, review "
            "non-essential outflows, and protect liquidity."
        )

        priority = "CRITICAL"
        action = "Protect Cash Position"

    elif risk == "HIGH":
        title = "High Cash Flow Risk"

        explanation = (
            f"Current cash is ₹{current_cash:,.2f}. "
            f"Net cash flow is ₹{net_cash_flow:,.2f}. "
            f"Overdue receivables are "
            f"₹{overdue_receivables:,.2f}."
        )

        recommendation = (
            "Accelerate overdue collections and "
            "review upcoming cash outflows."
        )

        priority = "HIGH"
        action = "Stabilize Cash Flow"

    elif overdue_receivables > 0:
        title = "Receivables Need Attention"

        explanation = (
            f"Receivables are ₹{receivables:,.2f}, "
            f"of which ₹{overdue_receivables:,.2f} "
            "is overdue."
        )

        recommendation = (
            "Prioritize overdue receivables and "
            "follow up on upcoming collections."
        )

        priority = "MEDIUM"
        action = "Accelerate Collections"

    elif (
        due_soon_collections > 0
        and net_cash_flow < 0
    ):
        title = "Near-Term Collection Opportunity"

        explanation = (
            f"Net cash flow is ₹{net_cash_flow:,.2f}, "
            f"while ₹{due_soon_collections:,.2f} "
            "is due soon."
        )

        recommendation = (
            "Follow up on due-soon collections "
            "and align payments with available cash."
        )

        priority = "MEDIUM"
        action = "Follow Up Collections"

    elif net_cash_flow < 0:
        title = "Negative Net Cash Flow"

        explanation = (
            f"Money in is ₹{money_in:,.2f}, "
            f"money out is ₹{money_out:,.2f}, "
            f"resulting in net cash flow "
            f"of ₹{net_cash_flow:,.2f}."
        )

        recommendation = (
            "Review major outflows and "
            "monitor receivables closely."
        )

        priority = (
            "HIGH"
            if health_score < 50
            else "MEDIUM"
        )

        action = "Review Cash Outflows"

    elif projected_net < 0:
        title = "Projected Cash Pressure"

        explanation = (
            f"Projected net cash flow is "
            f"₹{projected_net:,.2f}. "
            f"Projected lowest balance is "
            f"₹{projected_lowest_balance:,.2f}."
        )

        recommendation = (
            "Review projected outflows and "
            "strengthen collection timing."
        )

        priority = (
            "HIGH"
            if projected_lowest_balance < 0
            else "MEDIUM"
        )

        action = "Review Cash Forecast"

    elif money_in > money_out:
        title = "Positive Cash Flow Position"

        explanation = (
            f"Money in is ₹{money_in:,.2f} "
            f"versus money out of "
            f"₹{money_out:,.2f}."
        )

        recommendation = (
            "Maintain collection momentum and "
            "disciplined spending."
        )

        priority = "POSITIVE"
        action = "Maintain Cash Discipline"

    else:
        title = "Cash Flow Monitoring Insight"

        explanation = (
            f"Current cash is ₹{current_cash:,.2f}; "
            f"net cash flow is "
            f"₹{net_cash_flow:,.2f}."
        )

        recommendation = (
            "Continue monitoring cash movement "
            "and receivables."
        )

        priority = "LOW"
        action = "Monitor Cash Flow"

    evidence = " | ".join(
        [
            f"Current cash: ₹{current_cash:,.2f}",
            f"Money in: ₹{money_in:,.2f}",
            f"Money out: ₹{money_out:,.2f}",
            f"Net cash flow: ₹{net_cash_flow:,.2f}",
            f"Receivables: ₹{receivables:,.2f}",
            f"Overdue receivables: ₹{overdue_receivables:,.2f}",
            f"Due-soon collections: ₹{due_soon_collections:,.2f}",
            f"Health score: {health_score:.0f}/100",
            f"Shortfall risk: {risk}",
            f"Projected inflow: ₹{projected_inflow:,.2f}",
            f"Projected outflow: ₹{projected_outflow:,.2f}",
        ]
    )

    return {
        "type": "Cash Flow Insight",
        "title": title,
        "explanation": explanation,
        "evidence": evidence,
        "recommendation": recommendation,
        "action": action,
        "priority": priority,
        "confidence_note": (
            "Fallback financial interpretation "
            "generated from supplied live values."
        ),
    }


@router.post(
    "/insight/cash-flow",
    response_model=CashFlowInsightResponse,
)
def cash_flow_insight(
    request: CashFlowInsightRequest,
    current_user: Any = Depends(
        get_authenticated_user
    ),
) -> CashFlowInsightResponse:
    business_id = _safe_text(
        request.business_id,
        "",
        100,
    )

    _assert_authenticated_business_context(
        current_user,
        business_id,
    )

    planning_horizon_days = max(
        1,
        min(
            365,
            _safe_int(
                request.planning_horizon_days,
                14,
            ),
        ),
    )

    current_cash = _safe_float(
        request.current_cash
    )

    money_in = _safe_float(
        request.money_in
    )

    money_out = _safe_float(
        request.money_out
    )

    net_cash_flow = _safe_float(
        request.net_cash_flow
    )

    receivables = _safe_float(
        request.receivables
    )

    overdue_receivables = _safe_float(
        request.overdue_receivables
    )

    due_soon_collections = _safe_float(
        request.due_soon_collections
    )

    projected_inflow = _safe_float(
        request.projected_inflow
    )

    projected_outflow = _safe_float(
        request.projected_outflow
    )

    projected_net = _safe_float(
        request.projected_net
    )

    projected_lowest_balance = _safe_float(
        request.projected_lowest_balance
    )

    health_score = _clamp(
        _safe_float(
            request.health_score
        ),
        0,
        100,
    )

    risk = _normalize_priority(
        request.shortfall_risk,
        "LOW",
    )

    fallback = _build_fallback_insight(
        current_cash=current_cash,
        money_in=money_in,
        money_out=money_out,
        net_cash_flow=net_cash_flow,
        receivables=receivables,
        overdue_receivables=overdue_receivables,
        due_soon_collections=due_soon_collections,
        projected_inflow=projected_inflow,
        projected_outflow=projected_outflow,
        projected_net=projected_net,
        projected_lowest_balance=projected_lowest_balance,
        health_score=health_score,
        risk=risk,
    )

    cash_flow_data = {
        "business_id": business_id,
        "planning_horizon_days":
            planning_horizon_days,
        "current_cash": current_cash,
        "money_in": money_in,
        "money_out": money_out,
        "net_cash_flow": net_cash_flow,
        "receivables": receivables,
        "overdue_receivables":
            overdue_receivables,
        "due_soon_collections":
            due_soon_collections,
        "projected_inflow":
            projected_inflow,
        "projected_outflow":
            projected_outflow,
        "projected_net":
            projected_net,
        "projected_lowest_balance":
            projected_lowest_balance,
        "shortfall_risk": risk,
        "health_score": health_score,
    }

    system_prompt = """
You are CashGuard AI, a professional MSME
cash-flow intelligence assistant.

Analyze ONLY the supplied structured financial data.

Never invent financial values, customers,
transactions, dates, balances, causes,
or future events.

Do not change supplied numeric values.

Return ONLY valid JSON:

{
  "type": "string",
  "title": "string",
  "explanation": "string",
  "evidence": "string",
  "recommendation": "string",
  "action": "string",
  "priority": "LOW|MEDIUM|HIGH|CRITICAL|POSITIVE",
  "confidence_note": "string"
}
""".strip()

    user_prompt = (
        "Analyze this live CashGuard "
        "cash-flow intelligence:\n\n"
        + json.dumps(
            cash_flow_data,
            indent=2,
            ensure_ascii=False,
        )
    )

    try:
        result = ollama_service.generate(
            prompt=user_prompt,
            system_prompt=system_prompt,
        )

        if not isinstance(
            result,
            dict,
        ):
            raise RuntimeError(
                "Invalid Ollama response."
            )

        model = _safe_text(
            result.get(
                "model"
            ),
            "unknown",
            200,
        )

        raw_response = _safe_text(
            result.get(
                "response"
            ),
            "",
            30000,
        )

        parsed = _extract_json_from_llm(
            raw_response
        )

        if not parsed:
            return CashFlowInsightResponse(
                success=False,
                domain="cash_flow",
                model=(
                    model
                    or "cashguard-rule-engine"
                ),
                insight=fallback,
            )

        insight = _normalise_insight(
            parsed,
            request,
        )

        if not insight.get(
            "explanation"
        ):
            raise ValueError(
                "AI explanation missing."
            )

        if not insight.get(
            "recommendation"
        ):
            raise ValueError(
                "AI recommendation missing."
            )

        return CashFlowInsightResponse(
            success=True,
            domain="cash_flow",
            model=(
                model
                or "unknown"
            ),
            insight=insight,
        )

    except Exception:
        return CashFlowInsightResponse(
            success=False,
            domain="cash_flow",
            model="cashguard-rule-engine",
            insight=fallback,
        )


# ============================================================
# AI INSIGHTS PAGE RESPONSE
# ============================================================


class AIInsightsResponse(BaseModel):
    success: bool
    generated_at: str
    executive_summary: dict[str, Any]
    kpis: dict[str, Any]
    trends: list[dict[str, Any]]
    insights: list[dict[str, Any]]
    recommended_actions: list[
        dict[str, Any]
    ]
    freshness: dict[str, Any]


# ============================================================
# GENAI INSIGHTS
# ============================================================


def _generate_genai_insights(
    financial_context: dict[str, Any],
    candidate_insights: list[dict[str, Any]],
) -> tuple[
    str,
    list[str],
    list[dict[str, Any]],
    int,
    list[dict[str, Any]],
    str,
    bool,
]:
    fallback_headline = (
        "Business financial activity is being "
        "monitored using live CashGuard data."
    )

    fallback_bullets = [
        "Live revenue, expense and cash metrics are being monitored.",
        "Receivables and overdue collections are included in the analysis.",
        "ML payment-risk predictions are included when available.",
        "Risk signals are derived from current financial activity.",
        "Recommendations are generated from available business data.",
    ]

    fallback_confidence = 78

    candidate_ids = [
        _safe_text(
            item.get("id"),
            "",
            100,
        )
        for item in candidate_insights
        if _safe_text(
            item.get("id"),
            "",
            100,
        )
    ]

    system_prompt = """
You are CashGuard AI for Indian MSMEs.

Convert the supplied structured financial signals
into concise business intelligence.

IMPORTANT:
- Supplied numeric values are authoritative.
- Persisted ML values are authoritative.
- Never invent customers, transactions, balances, dates or causes.
- Never create numeric values that are not supplied.
- Preserve the meaning of financial metrics.
- Clearly distinguish ML signals from normal financial metrics.
- Every insight MUST use an EXACT candidate insight ID.
- Never create a new insight ID.
- Do not include unsupported numerical claims in headline/bullets.
- Prefer practical recommendations.

Return ONLY valid JSON:

{
  "headline": "string",
  "bullets": ["string"],
  "confidence": 0-100,
  "insights": [
    {
      "id": "EXACT_CANDIDATE_ID",
      "title": "string",
      "category": "Cash Flow|Revenue|Expenses|Customers|Vendors|Risk",
      "priority": "Critical|High|Medium|Low|Positive",
      "summary": "string",
      "metric_label": "string",
      "impact": "string",
      "recommendation": "string",
      "action": "string",
      "related_entity": "string",
      "related_route": "string",
      "confidence": 0-100
    }
  ],
  "actions": [
    {
      "title": "string",
      "description": "string",
      "route": "string"
    }
  ]
}

Return no more than 10 insights.
""".strip()

    prompt = (
        "ALLOWED CANDIDATE IDS:\n"
        + json.dumps(
            candidate_ids,
            ensure_ascii=False,
        )
        + "\n\nLIVE CASHGUARD FINANCIAL CONTEXT:\n"
        + json.dumps(
            financial_context,
            indent=2,
            ensure_ascii=False,
            default=str,
        )
        + "\n\nCANDIDATE SIGNALS:\n"
        + json.dumps(
            candidate_insights,
            indent=2,
            ensure_ascii=False,
            default=str,
        )
    )

    try:
        result = ollama_service.generate(
            prompt=prompt,
            system_prompt=system_prompt,
        )

        if not isinstance(
            result,
            dict,
        ):
            raise RuntimeError(
                "Invalid Ollama result."
            )

        model = _safe_text(
            result.get(
                "model"
            ),
            "unknown",
            200,
        )

        raw_response = _safe_text(
            result.get(
                "response"
            ),
            "",
            40000,
        )

        parsed = _extract_json_from_llm(
            raw_response
        )

        if not parsed:
            return (
                fallback_headline,
                fallback_bullets,
                candidate_insights,
                fallback_confidence,
                [],
                "cashguard-rule-engine",
                False,
            )

        headline = _safe_text(
            parsed.get(
                "headline"
            ),
            fallback_headline,
            1000,
        )

        bullets_raw = parsed.get(
            "bullets",
            fallback_bullets,
        )

        if not isinstance(
            bullets_raw,
            list,
        ):
            bullets_raw = fallback_bullets

        bullets = [
            _safe_text(
                bullet,
                "",
                500,
            )
            for bullet in bullets_raw
            if _safe_text(
                bullet,
                "",
                500,
            )
        ][:6]

        confidence = int(
            _clamp(
                _safe_float(
                    parsed.get(
                        "confidence",
                        fallback_confidence,
                    )
                ),
                0,
                100,
            )
        )

        ai_insights = parsed.get(
            "insights",
            [],
        )

        if not isinstance(
            ai_insights,
            list,
        ):
            ai_insights = []

        normalized_insights: list[
            dict[str, Any]
        ] = []

        category_values = {
            "Cash Flow",
            "Revenue",
            "Expenses",
            "Customers",
            "Vendors",
            "Risk",
        }

        # Only accept insight IDs that originated
        # from our deterministic candidate signals.
        for item in ai_insights[:10]:
            if not isinstance(
                item,
                dict,
            ):
                continue

            item_id = _safe_text(
                item.get(
                    "id"
                ),
                "",
                100,
            )

            if item_id not in candidate_ids:
                continue

            category = _safe_text(
                item.get(
                    "category"
                ),
                "Risk",
                50,
            )

            if category not in category_values:
                category = "Risk"

            priority = _normalize_priority(
                item.get(
                    "priority"
                ),
                "MEDIUM",
            )

            normalized_insights.append(
                {
                    "id": item_id,
                    "title": _safe_text(
                        item.get(
                            "title"
                        ),
                        "Financial Insight",
                        500,
                    ),
                    "category": category,
                    "priority": priority.title(),
                    "summary": _safe_text(
                        item.get(
                            "summary"
                        ),
                        "CashGuard detected a relevant financial pattern.",
                        1500,
                    ),
                    "metric": None,
                    "metric_label": _safe_text(
                        item.get(
                            "metric_label"
                        ),
                        "Live financial metric",
                        300,
                    ),
                    "impact": _safe_text(
                        item.get(
                            "impact"
                        ),
                        "This signal may affect financial performance.",
                        1500,
                    ),
                    "recommendation": _safe_text(
                        item.get(
                            "recommendation"
                        ),
                        "Review the related financial activity.",
                        1500,
                    ),
                    "action": _safe_text(
                        item.get(
                            "action"
                        ),
                        "Review",
                        300,
                    ),
                    "related_entity": _safe_text(
                        item.get(
                            "related_entity"
                        ),
                        "Business financial activity",
                        500,
                    ),
                    "related_route": _safe_text(
                        item.get(
                            "related_route"
                        ),
                        "/dashboard",
                        300,
                    ),
                    "confidence": int(
                        _clamp(
                            _safe_float(
                                item.get(
                                    "confidence",
                                    confidence,
                                )
                            ),
                            0,
                            100,
                        )
                    ),
                    "created_at": _iso_now(),
                    "reviewed": False,
                    "saved": False,
                }
            )

        actions = parsed.get(
            "actions",
            [],
        )

        if not isinstance(
            actions,
            list,
        ):
            actions = []

        normalized_actions: list[
            dict[str, Any]
        ] = []

        for action in actions[:6]:
            if not isinstance(
                action,
                dict,
            ):
                continue

            normalized_actions.append(
                {
                    "title": _safe_text(
                        action.get(
                            "title"
                        ),
                        "Review",
                        300,
                    ),
                    "description": _safe_text(
                        action.get(
                            "description"
                        ),
                        "Review the related financial activity.",
                        500,
                    ),
                    "route": _safe_text(
                        action.get(
                            "route"
                        ),
                        "/dashboard",
                        300,
                    ),
                }
            )

        if not normalized_insights:
            normalized_insights = candidate_insights

        return (
            headline,
            bullets or fallback_bullets,
            normalized_insights,
            confidence,
            normalized_actions,
            model or "unknown",
            True,
        )

    except Exception:
        return (
            fallback_headline,
            fallback_bullets,
            candidate_insights,
            fallback_confidence,
            [],
            "cashguard-rule-engine",
            False,
        )


# ============================================================
# RUN-RATE FORECAST
# ============================================================


def _calculate_run_rate_forecast(
    *,
    current_cash: float,
    net_cash_flow: float,
    planning_horizon_days: int,
) -> dict[str, Any]:
    horizon = max(
        1,
        min(
            365,
            planning_horizon_days,
        ),
    )

    daily_net = (
        net_cash_flow / 30.0
    )

    projected_net = (
        daily_net * horizon
    )

    projected_end_balance = (
        current_cash
        + projected_net
    )

    projected_lowest_balance = min(
        current_cash,
        projected_end_balance,
    )

    projected_inflow = max(
        daily_net,
        0.0,
    ) * horizon

    projected_outflow = max(
        -daily_net,
        0.0,
    ) * horizon

    return {
        "method": "deterministic_30d_run_rate",
        "horizon_days": horizon,
        "daily_net_run_rate":
            _format_money(
                daily_net
            ),
        "projected_inflow":
            _format_money(
                projected_inflow
            ),
        "projected_outflow":
            _format_money(
                projected_outflow
            ),
        "projected_net":
            _format_money(
                projected_net
            ),
        "projected_end_balance":
            _format_money(
                projected_end_balance
            ),
        "projected_lowest_balance":
            _format_money(
                projected_lowest_balance
            ),
    }


# ============================================================
# AI INSIGHTS ENDPOINT
# ============================================================


@router.get(
    "/insights",
    response_model=AIInsightsResponse,
)
def get_ai_insights(
    business_id: str = Query(
        ...,
        min_length=1,
        max_length=100,
    ),
    limit: int = Query(
        50,
        ge=1,
        le=100,
    ),
    analyze: bool = Query(
        False
    ),
    planning_horizon_days: int = Query(
        14,
        ge=1,
        le=365,
    ),
    current_user: Any = Depends(
        get_authenticated_user
    ),
) -> AIInsightsResponse:
    business_id = _safe_text(
        business_id,
        "",
        100,
    )

    if not business_id:
        raise HTTPException(
            status_code=400,
            detail="business_id is required.",
        )

    _assert_authenticated_business_context(
        current_user,
        business_id,
    )

    planning_horizon_days = max(
        1,
        min(
            365,
            _safe_int(
                planning_horizon_days,
                14,
            ),
        ),
    )

    connection = None
    generated_at = _iso_now()

    try:
        connection = _get_db_connection()

        # ----------------------------------------------------
        # Business validation
        # ----------------------------------------------------

        if not _table_exists(
            connection,
            "businesses",
        ):
            raise HTTPException(
                status_code=500,
                detail="CashGuard business table was not found.",
            )

        business_columns = _get_table_columns(
            connection,
            "businesses",
        )

        business_id_column = _pick_column(
            business_columns,
            [
                "id",
                "business_id",
                "uuid",
            ],
        )

        if business_id_column:
            check_sql = f"""
                SELECT COUNT(*) AS total
                FROM `businesses`
                WHERE CAST(
                    `{business_id_column}`
                    AS CHAR
                ) = %s
            """

            business_exists = _execute_int(
                connection,
                check_sql,
                (business_id,),
            )

            if business_exists == 0:
                raise HTTPException(
                    status_code=404,
                    detail="Business not found.",
                )

        # ----------------------------------------------------
        # Date windows
        # ----------------------------------------------------

        today = date.today()

        current_start = (
            today
            - timedelta(days=29)
        )

        previous_start = (
            today
            - timedelta(days=59)
        )

        previous_end = (
            today
            - timedelta(days=30)
        )

        # ----------------------------------------------------
        # Revenue
        # ----------------------------------------------------

        recent_revenue = _sum_table_amount(
            connection,
            "sales",
            business_id,
            current_start,
            today,
        )

        previous_revenue = _sum_table_amount(
            connection,
            "sales",
            business_id,
            previous_start,
            previous_end,
        )

        # ----------------------------------------------------
        # Expenses
        # ----------------------------------------------------

        recent_expenses = _sum_table_amount(
            connection,
            "expenses",
            business_id,
            current_start,
            today,
        )

        previous_expenses = _sum_table_amount(
            connection,
            "expenses",
            business_id,
            previous_start,
            previous_end,
        )

        # ----------------------------------------------------
        # Payments / inflow
        # ----------------------------------------------------

        recent_payments = _sum_table_amount(
            connection,
            "payments",
            business_id,
            current_start,
            today,
        )

        previous_payments = _sum_table_amount(
            connection,
            "payments",
            business_id,
            previous_start,
            previous_end,
        )

        money_in = (
            recent_payments
            if recent_payments != 0
            else recent_revenue
        )

        previous_money_in = (
            previous_payments
            if previous_payments != 0
            else previous_revenue
        )

        money_out = recent_expenses
        previous_money_out = previous_expenses

        net_cash_flow = (
            money_in
            - money_out
        )

        previous_net_cash_flow = (
            previous_money_in
            - previous_money_out
        )

        # ----------------------------------------------------
        # Current cash
        # ----------------------------------------------------

        current_cash = _get_cash_position(
            connection,
            business_id,
        )

        if current_cash == 0:
            current_cash = net_cash_flow

        # ----------------------------------------------------
        # Receivables
        # ----------------------------------------------------

        receivable_metrics = (
            _get_receivable_metrics(
                connection,
                business_id,
            )
        )

        outstanding_receivables = _safe_float(
            receivable_metrics.get(
                "outstanding",
                0,
            )
        )

        overdue_receivables = _safe_float(
            receivable_metrics.get(
                "overdue",
                0,
            )
        )

        due_soon_collections = _safe_float(
            receivable_metrics.get(
                "due_soon",
                0,
            )
        )

        # ----------------------------------------------------
        # ML
        # ----------------------------------------------------

        ml_risk_summary = (
            _get_persisted_ml_risk_summary(
                connection,
                business_id,
            )
        )

        ml_total_predictions = _safe_int(
            ml_risk_summary.get(
                "total_predictions",
                0,
            )
        )

        ml_high_risk_count = _safe_int(
            ml_risk_summary.get(
                "high_risk_count",
                0,
            )
        )

        ml_critical_risk_count = _safe_int(
            ml_risk_summary.get(
                "critical_risk_count",
                0,
            )
        )

        ml_medium_risk_count = _safe_int(
            ml_risk_summary.get(
                "medium_risk_count",
                0,
            )
        )

        ml_low_risk_count = _safe_int(
            ml_risk_summary.get(
                "low_risk_count",
                0,
            )
        )

        ml_average_risk_score = _safe_float(
            ml_risk_summary.get(
                "average_risk_score",
                0,
            )
        )

        ml_highest_risk_score = _safe_float(
            ml_risk_summary.get(
                "highest_risk_score",
                0,
            )
        )

        ml_latest_risk_level = _safe_text(
            ml_risk_summary.get(
                "latest_risk_level"
            ),
            "LOW",
            50,
        )

        ml_model_version = _safe_text(
            ml_risk_summary.get(
                "latest_model_version"
            ),
            "",
            200,
        )

        ml_prediction_source = _safe_text(
            ml_risk_summary.get(
                "latest_prediction_source"
            ),
            "",
            200,
        )

        ml_priority_signals = (
            ml_risk_summary.get(
                "priority_signals",
                [],
            )
        )

        if not isinstance(
            ml_priority_signals,
            list,
        ):
            ml_priority_signals = []

        # ----------------------------------------------------
        # Deterministic forecast
        # ----------------------------------------------------

        forecast = _calculate_run_rate_forecast(
            current_cash=current_cash,
            net_cash_flow=net_cash_flow,
            planning_horizon_days=planning_horizon_days,
        )

        projected_lowest_balance = _safe_float(
            forecast.get(
                "projected_lowest_balance",
                current_cash,
            )
        )

        # ----------------------------------------------------
        # Risk signals
        # ----------------------------------------------------

        (
            risk_signals,
            high_priority_risk_signals,
            candidate_insights,
        ) = _calculate_risk_signals(
            current_cash=current_cash,
            net_cash_flow=net_cash_flow,
            overdue_receivables=overdue_receivables,
            outstanding_receivables=outstanding_receivables,
            projected_lowest_balance=projected_lowest_balance,
            recent_revenue=recent_revenue,
            recent_expenses=recent_expenses,
            ml_risk_summary=ml_risk_summary,
        )

        # ----------------------------------------------------
        # Financial health
        # ----------------------------------------------------

        financial_health, health_label = (
            _calculate_financial_health(
                current_cash=current_cash,
                net_cash_flow=net_cash_flow,
                overdue_receivables=overdue_receivables,
                outstanding_receivables=outstanding_receivables,
                recent_revenue=recent_revenue,
                recent_expenses=recent_expenses,
                risk_signals=risk_signals,
                ml_high_risk_count=ml_high_risk_count,
                ml_critical_risk_count=ml_critical_risk_count,
            )
        )

        # ----------------------------------------------------
        # Trends
        # ----------------------------------------------------

        trends = _get_monthly_trends(
            connection,
            business_id,
            months=6,
        )

        # ----------------------------------------------------
        # Period comparison
        # ----------------------------------------------------

        if previous_money_in != 0:
            cash_change_percent = (
                (
                    money_in
                    - previous_money_in
                )
                / abs(
                    previous_money_in
                )
            ) * 100
        else:
            cash_change_percent = (
                100.0
                if money_in > 0
                else 0.0
            )

        cash_change_percent = _clamp(
            cash_change_percent,
            -9999,
            9999,
        )

        # ----------------------------------------------------
        # GenAI context
        # ----------------------------------------------------

        financial_context = {
            "business_id":
                business_id,

            "analysis_mode":
                (
                    "fresh_live_analysis"
                    if analyze
                    else "live_analysis"
                ),

            "analysis_date":
                today.isoformat(),

            "current_period": {
                "money_in":
                    _format_money(
                        money_in
                    ),
                "money_out":
                    _format_money(
                        money_out
                    ),
                "net_cash_flow":
                    _format_money(
                        net_cash_flow
                    ),
                "cash_position":
                    _format_money(
                        current_cash
                    ),
                "revenue":
                    _format_money(
                        recent_revenue
                    ),
                "expenses":
                    _format_money(
                        recent_expenses
                    ),
            },

            "previous_period": {
                "money_in":
                    _format_money(
                        previous_money_in
                    ),
                "money_out":
                    _format_money(
                        previous_money_out
                    ),
                "net_cash_flow":
                    _format_money(
                        previous_net_cash_flow
                    ),
            },

            "receivables": {
                "outstanding":
                    _format_money(
                        outstanding_receivables
                    ),
                "outstanding_count":
                    receivable_metrics.get(
                        "outstanding_count",
                        0,
                    ),
                "overdue":
                    _format_money(
                        overdue_receivables
                    ),
                "overdue_count":
                    receivable_metrics.get(
                        "overdue_count",
                        0,
                    ),
                "due_soon":
                    _format_money(
                        due_soon_collections
                    ),
            },

            "ml_risk": {
                "available":
                    bool(
                        ml_risk_summary.get(
                            "available",
                            False,
                        )
                    ),
                "total_predictions":
                    ml_total_predictions,
                "high_risk_count":
                    ml_high_risk_count,
                "critical_risk_count":
                    ml_critical_risk_count,
                "medium_risk_count":
                    ml_medium_risk_count,
                "low_risk_count":
                    ml_low_risk_count,
                "average_risk_score":
                    round(
                        ml_average_risk_score,
                        4,
                    ),
                "highest_risk_score":
                    round(
                        ml_highest_risk_score,
                        4,
                    ),
                "latest_risk_level":
                    ml_latest_risk_level,
                "latest_model_version":
                    ml_model_version,
                "latest_prediction_source":
                    ml_prediction_source,
                "priority_signals":
                    ml_priority_signals[:10],
            },

            "health": {
                "score":
                    financial_health,
                "label":
                    health_label,
            },

            "forecast": forecast,

            "risk": {
                "signals":
                    risk_signals,
                "high_priority":
                    high_priority_risk_signals,
            },

            "trend": trends,
        }

        # ----------------------------------------------------
        # Candidate signal cleanup
        # ----------------------------------------------------

        cleaned_candidates: list[
            dict[str, Any]
        ] = []

        for candidate in candidate_insights:
            cleaned = dict(candidate)

            if cleaned.get("metric") is not None:
                cleaned["metric"] = _format_money(
                    _safe_float(
                        cleaned.get(
                            "metric"
                        )
                    )
                )

            cleaned["confidence"] = int(
                _clamp(
                    _safe_float(
                        cleaned.get(
                            "confidence",
                            86,
                        )
                    ),
                    0,
                    100,
                )
            )

            cleaned["created_at"] = _safe_text(
                cleaned.get(
                    "created_at"
                ),
                _iso_now(),
                100,
            )

            cleaned["reviewed"] = False
            cleaned["saved"] = False

            cleaned_candidates.append(
                cleaned
            )

        candidate_insights = cleaned_candidates

        # ----------------------------------------------------
        # Positive revenue signal
        # ----------------------------------------------------

        if (
            recent_revenue
            > previous_revenue
            and recent_revenue > 0
        ):
            growth = (
                (
                    recent_revenue
                    - previous_revenue
                )
                / abs(
                    previous_revenue
                )
                * 100
                if previous_revenue
                else 100
            )

            candidate_insights.append(
                {
                    "id":
                        "revenue-improvement",
                    "title":
                        "Revenue is improving",
                    "category":
                        "Revenue",
                    "priority":
                        "Positive",
                    "summary": (
                        "Recorded revenue is "
                        "higher than the previous period."
                    ),
                    "metric":
                        _format_money(
                            recent_revenue
                            - previous_revenue
                        ),
                    "metric_label":
                        "additional revenue",
                    "impact": (
                        "Improved operating revenue "
                        "can strengthen cash generation."
                    ),
                    "recommendation": (
                        "Maintain the activities that "
                        "are supporting current revenue momentum."
                    ),
                    "action":
                        "Review Analytics",
                    "related_entity":
                        "Recent sales activity",
                    "related_route":
                        "/analytics",
                    "confidence": 89,
                    "created_at":
                        _iso_now(),
                    "reviewed": False,
                    "saved": False,
                    "_growth":
                        round(
                            growth,
                            1,
                        ),
                }
            )

        # ----------------------------------------------------
        # Positive cash signal
        # ----------------------------------------------------

        if (
            net_cash_flow > 0
            and current_cash > 0
        ):
            candidate_insights.append(
                {
                    "id":
                        "positive-cash-flow",
                    "title":
                        "Cash flow is positive",
                    "category":
                        "Cash Flow",
                    "priority":
                        "Positive",
                    "summary": (
                        "Recent recorded inflows "
                        "are exceeding recorded outflows."
                    ),
                    "metric":
                        _format_money(
                            net_cash_flow
                        ),
                    "metric_label":
                        "positive net cash flow",
                    "impact": (
                        "Positive operating cash flow "
                        "supports near-term liquidity."
                    ),
                    "recommendation": (
                        "Maintain disciplined collections "
                        "and spending."
                    ),
                    "action":
                        "View Cash Flow",
                    "related_entity":
                        "Recent cash movement",
                    "related_route":
                        "/cash-flow",
                    "confidence": 90,
                    "created_at":
                        _iso_now(),
                    "reviewed": False,
                    "saved": False,
                }
            )

        # ----------------------------------------------------
        # ML summary signal
        # ----------------------------------------------------

        if ml_total_predictions > 0:
            candidate_insights.append(
                {
                    "id":
                        "ml-risk-summary",
                    "title":
                        "ML payment-risk analysis is active",
                    "category":
                        "Risk",
                    "priority":
                        (
                            "Critical"
                            if ml_critical_risk_count > 0
                            else (
                                "High"
                                if ml_high_risk_count > 0
                                else "Medium"
                            )
                        ),
                    "summary": (
                        f"{ml_total_predictions} persisted "
                        "ML payment-risk prediction(s) are "
                        "available for this business."
                    ),
                    "metric":
                        ml_high_risk_count
                        + ml_critical_risk_count,
                    "metric_label":
                        "high-priority ML predictions",
                    "impact": (
                        "Payment-risk predictions can help "
                        "prioritize collection actions."
                    ),
                    "recommendation": (
                        "Review high-risk payment predictions "
                        "before planning near-term cash commitments."
                    ),
                    "action":
                        "Review Payment Risk",
                    "related_entity":
                        ml_model_version
                        or "CashGuard RiskPredictor",
                    "related_route":
                        "/risk",
                    "confidence":
                        91,
                    "created_at":
                        _iso_now(),
                    "reviewed":
                        False,
                    "saved":
                        False,
                }
            )

        candidate_insights = candidate_insights[:limit]

        # ----------------------------------------------------
        # GenAI
        # ----------------------------------------------------

        (
            ai_headline,
            ai_bullets,
            ai_insights,
            ai_confidence,
            ai_actions,
            ai_model,
            ai_used,
        ) = _generate_genai_insights(
            financial_context,
            candidate_insights,
        )

        # ----------------------------------------------------
        # Strict source grounding
        # ----------------------------------------------------

        source_by_id = {
            item.get("id"):
                item
            for item in candidate_insights
            if item.get("id")
        }

        final_insights: list[
            dict[str, Any]
        ] = []

        for ai_item in ai_insights[:limit]:
            item_id = _safe_text(
                ai_item.get(
                    "id"
                ),
                "",
                100,
            )

            source = source_by_id.get(
                item_id
            )

            # Do not accept AI-created IDs.
            if not source:
                continue

            grounded = dict(ai_item)

            # Numeric metric always comes from the deterministic
            # source signal, never from the LLM.
            grounded["metric"] = source.get(
                "metric"
            )

            grounded["metric_label"] = source.get(
                "metric_label"
            )

            grounded["created_at"] = source.get(
                "created_at",
                generated_at,
            )

            grounded["related_route"] = source.get(
                "related_route",
                grounded.get(
                    "related_route",
                    "/dashboard",
                ),
            )

            grounded["confidence"] = int(
                _clamp(
                    _safe_float(
                        grounded.get(
                            "confidence",
                            source.get(
                                "confidence",
                                ai_confidence,
                            ),
                        )
                    ),
                    0,
                    100,
                )
            )

            if source.get(
                "ml_average_risk_score"
            ) is not None:
                grounded[
                    "ml_average_risk_score"
                ] = source.get(
                    "ml_average_risk_score"
                )

            final_insights.append(
                grounded
            )

        if not final_insights:
            final_insights = candidate_insights[:limit]

        # ----------------------------------------------------
        # Recommended actions
        # ----------------------------------------------------

        recommended_actions: list[
            dict[str, Any]
        ] = []

        route_seen: set[str] = set()

        for action in ai_actions:
            route = _safe_text(
                action.get(
                    "route"
                ),
                "/dashboard",
                300,
            )

            if route in route_seen:
                continue

            route_seen.add(
                route
            )

            recommended_actions.append(
                {
                    "title":
                        _safe_text(
                            action.get(
                                "title"
                            ),
                            "Review",
                            300,
                        ),
                    "description":
                        _safe_text(
                            action.get(
                                "description"
                            ),
                            "Review the related financial area.",
                            500,
                        ),
                    "route":
                        route,
                }
            )

            if len(
                recommended_actions
            ) >= 4:
                break

        for insight in final_insights:
            if len(
                recommended_actions
            ) >= 4:
                break

            route = _safe_text(
                insight.get(
                    "related_route"
                ),
                "/dashboard",
                300,
            )

            if route in route_seen:
                continue

            route_seen.add(
                route
            )

            recommended_actions.append(
                {
                    "title":
                        _safe_text(
                            insight.get(
                                "action"
                            ),
                            "Review",
                            300,
                        ),
                    "description":
                        _safe_text(
                            insight.get(
                                "recommendation"
                            ),
                            "Review this financial area.",
                            500,
                        ),
                    "route":
                        route,
                }
            )

        # ----------------------------------------------------
        # Final response
        # ----------------------------------------------------

        return AIInsightsResponse(
            success=True,
            generated_at=generated_at,

            executive_summary={
                "headline":
                    ai_headline,
                "bullets":
                    ai_bullets,
                "confidence":
                    ai_confidence,
                "model_layer":
                    ai_model,
                "ml_layer":
                    (
                        ml_model_version
                        or "CashGuard RiskPredictor"
                    ),
            },

            kpis={
                "financial_health":
                    financial_health,

                "financial_health_label":
                    health_label,

                "cash_position":
                    _format_money(
                        current_cash
                    ),

                "cash_position_change_percent":
                    round(
                        cash_change_percent,
                        1,
                    ),

                "outstanding_receivables":
                    _format_money(
                        outstanding_receivables
                    ),

                "outstanding_receivables_count":
                    receivable_metrics.get(
                        "outstanding_count",
                        0,
                    ),

                "risk_signals":
                    risk_signals,

                "high_priority_risk_signals":
                    high_priority_risk_signals,

                "forecast":
                    forecast,

                "ml_total_predictions":
                    ml_total_predictions,

                "ml_high_risk_count":
                    ml_high_risk_count,

                "ml_critical_risk_count":
                    ml_critical_risk_count,

                "ml_medium_risk_count":
                    ml_medium_risk_count,

                "ml_low_risk_count":
                    ml_low_risk_count,

                "ml_average_risk_score":
                    round(
                        ml_average_risk_score,
                        4,
                    ),

                "ml_highest_risk_score":
                    round(
                        ml_highest_risk_score,
                        4,
                    ),

                "ml_latest_risk_level":
                    ml_latest_risk_level,

                "ml_model_version":
                    ml_model_version,

                "ml_prediction_source":
                    ml_prediction_source,
            },

            trends=trends,

            insights=final_insights,

            recommended_actions=
                recommended_actions,

            freshness={
                "updated_at":
                    generated_at,
                "coverage_days":
                    30,
                "source":
                    "live_mysql",
                "ml_predictions_included":
                    ml_total_predictions > 0,
                "genai_enabled":
                    ai_used,
                "analysis_mode":
                    (
                        "fresh"
                        if analyze
                        else "live"
                    ),
                "forecast_method":
                    forecast.get(
                        "method"
                    ),
                "planning_horizon_days":
                    planning_horizon_days,
            },
        )

    except HTTPException:
        raise

    except pymysql.MySQLError as exc:
        raise HTTPException(
            status_code=500,
            detail="AI Insights database error.",
        ) from exc

    except requests.RequestException as exc:
        raise HTTPException(
            status_code=502,
            detail="AI service is temporarily unavailable.",
        ) from exc

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="AI Insights generation failed.",
        ) from exc

    finally:
        if connection:
            try:
                connection.close()
            except Exception:
                pass
