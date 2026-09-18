from __future__ import annotations

import io
import json
import logging
import math
import os
import textwrap
import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any

import requests
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from auth_service.database import get_db
from auth_service.routes.auth import get_authenticated_user
from ollama.service import ollama_service
from paisa.models import BusinessMembership

logger = logging.getLogger("cashguard.analytics.routes")

router = APIRouter(
    prefix="/analytics",
    tags=["Analytics"],
)


# ============================================================================
# AUTHORIZATION
# ============================================================================


def _allowed_business_ids(db: Session, current_user: Any) -> set[str]:
    rows = db.scalars(
        select(BusinessMembership.business_id).where(
            BusinessMembership.user_id == int(current_user.id),
        )
    ).all()
    return {str(value).strip() for value in rows if str(value).strip()}


def _authorized_business_id(
    requested_business_id: str | None,
    current_user: Any,
    db: Session,
) -> str:
    allowed = _allowed_business_ids(db, current_user)
    if not allowed:
        raise HTTPException(
            status_code=409,
            detail="No business is configured for this account.",
        )

    requested = (requested_business_id or "").strip()
    if requested and requested not in allowed:
        raise HTTPException(
            status_code=403,
            detail="You are not authorized to access this business.",
        )

    return requested or sorted(allowed)[0]


# ============================================================================
# GENERIC DATABASE HELPERS
# ============================================================================


def _table_exists(db: Session, table_name: str) -> bool:
    value = db.execute(
        text(
            """
            SELECT COUNT(*)
            FROM information_schema.tables
            WHERE table_schema = DATABASE()
              AND table_name = :table_name
            """
        ),
        {"table_name": table_name},
    ).scalar_one()
    return int(value or 0) > 0


def _table_columns(db: Session, table_name: str) -> set[str]:
    rows = db.execute(
        text(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = DATABASE()
              AND table_name = :table_name
            """
        ),
        {"table_name": table_name},
    ).scalars().all()
    return {str(value) for value in rows if value}


def _pick_column(columns: set[str], candidates: list[str]) -> str | None:
    lowered = {column.lower(): column for column in columns}
    for candidate in candidates:
        actual = lowered.get(candidate.lower())
        if actual:
            return actual
    return None


def _quote_identifier(value: str) -> str:
    return f"`{value.replace('`', '')}`"


def _to_float(value: Any, default: float = 0.0) -> float:
    if value is None:
        return default
    try:
        return float(Decimal(str(value)))
    except Exception:
        return default


def _round(value: Any, digits: int = 2) -> float:
    return round(_to_float(value), digits)


def _date_value(value: Any) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    raw = str(value).strip()
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).date()
    except ValueError:
        try:
            return date.fromisoformat(raw[:10])
        except ValueError:
            return None


def _period_days(range_value: str) -> int:
    return {
        "7d": 7,
        "30d": 30,
        "quarter": 90,
        "year": 365,
    }.get(range_value, 30)


def _period_bounds(range_value: str, today: date | None = None) -> tuple[date, date]:
    end = today or date.today()
    start = end - timedelta(days=_period_days(range_value) - 1)
    return start, end


def _comparison_bounds(
    range_value: str,
    compare: str,
    today: date | None = None,
) -> tuple[date, date] | None:
    if compare == "none":
        return None
    current_start, _ = _period_bounds(range_value, today)
    days = _period_days(range_value)
    if compare == "previous_year":
        return current_start.replace(year=current_start.year - 1), (today or date.today()).replace(year=(today or date.today()).year - 1)
    comparison_end = current_start - timedelta(days=1)
    comparison_start = comparison_end - timedelta(days=days - 1)
    return comparison_start, comparison_end


def _date_where(
    columns: set[str],
    business_id: str,
    start: date,
    end: date,
    *,
    date_candidates: list[str],
    alias: str = "t",
) -> tuple[str, dict[str, Any], str | None]:
    business_col = _pick_column(columns, ["business_id", "businessId"])
    date_col = _pick_column(columns, date_candidates)
    if not business_col or not date_col:
        return "1=0", {}, None
    return (
        f"{alias}.{_quote_identifier(business_col)} = :business_id "
        f"AND DATE({alias}.{_quote_identifier(date_col)}) BETWEEN :start_date AND :end_date",
        {"business_id": business_id, "start_date": start, "end_date": end},
        date_col,
    )


def _amount_column(columns: set[str]) -> str | None:
    return _pick_column(
        columns,
        [
            "total_amount",
            "grand_total",
            "invoice_total",
            "amount",
            "total",
            "net_amount",
        ],
    )


def _safe_table_sum(
    db: Session,
    table_name: str,
    business_id: str,
    start: date,
    end: date,
    *,
    date_candidates: list[str],
    amount_candidates: list[str] | None = None,
) -> float:
    if not _table_exists(db, table_name):
        return 0.0
    columns = _table_columns(db, table_name)
    business_col = _pick_column(columns, ["business_id", "businessId"])
    date_col = _pick_column(columns, date_candidates)
    amount_col = _pick_column(columns, amount_candidates or ["total_amount", "amount", "grand_total", "total"])
    if not business_col or not date_col or not amount_col:
        return 0.0

    query = text(
        f"""
        SELECT COALESCE(SUM({_quote_identifier(amount_col)}), 0)
        FROM {_quote_identifier(table_name)}
        WHERE {_quote_identifier(business_col)} = :business_id
          AND DATE({_quote_identifier(date_col)}) BETWEEN :start_date AND :end_date
        """
    )
    return _to_float(
        db.execute(
            query,
            {"business_id": business_id, "start_date": start, "end_date": end},
        ).scalar_one()
    )


def _metric_change(current: float, previous: float | None) -> float | None:
    if previous is None:
        return None
    if abs(previous) < 0.000001:
        return None
    return round(((current - previous) / abs(previous)) * 100.0, 1)


# ============================================================================
# LIVE METRICS
# ============================================================================


def _revenue(
    db: Session,
    business_id: str,
    start: date,
    end: date,
) -> float:
    sales = _safe_table_sum(
        db,
        "sales",
        business_id,
        start,
        end,
        date_candidates=["sale_date", "date", "created_at"],
        amount_candidates=["total_amount", "amount", "net_amount", "total"],
    )
    if sales > 0:
        return sales

    return _safe_table_sum(
        db,
        "invoices",
        business_id,
        start,
        end,
        date_candidates=["invoice_date", "issue_date", "created_at"],
        amount_candidates=["total_amount", "amount", "grand_total"],
    )


def _expenses(
    db: Session,
    business_id: str,
    start: date,
    end: date,
) -> float:
    return _safe_table_sum(
        db,
        "expenses",
        business_id,
        start,
        end,
        date_candidates=["expense_date", "date", "created_at"],
        amount_candidates=["amount", "total_amount"],
    )


def _bank_summary(
    db: Session,
    business_id: str,
    start: date,
    end: date,
) -> tuple[float, float, float, int]:
    table_name = "bank_transactions"
    if not _table_exists(db, table_name):
        return 0.0, 0.0, 0.0, 0

    columns = _table_columns(db, table_name)
    business_col = _pick_column(columns, ["business_id", "businessId"])
    date_col = _pick_column(columns, ["transaction_date", "date", "created_at"])
    amount_col = _pick_column(columns, ["amount", "transaction_amount", "value"])
    type_col = _pick_column(columns, ["transaction_type", "type", "direction"])
    if not business_col or not date_col or not amount_col:
        return 0.0, 0.0, 0.0, 0

    direction_sql = ""
    if type_col:
        direction_sql = f"LOWER(COALESCE({_quote_identifier(type_col)}, ''))"

    if direction_sql:
        credit_condition = f"({direction_sql} LIKE '%credit%' OR {direction_sql} LIKE '%inflow%' OR {direction_sql} LIKE '%deposit%' OR {direction_sql} = 'cr')"
    else:
        credit_condition = "1=0"

    query = text(
        f"""
        SELECT
            COALESCE(SUM(CASE WHEN {credit_condition} THEN ABS({_quote_identifier(amount_col)}) ELSE 0 END), 0) AS credits,
            COALESCE(SUM(CASE WHEN {credit_condition} THEN 0 ELSE ABS({_quote_identifier(amount_col)}) END), 0) AS debits,
            COUNT(*) AS row_count
        FROM {_quote_identifier(table_name)}
        WHERE {_quote_identifier(business_col)} = :business_id
          AND DATE({_quote_identifier(date_col)}) BETWEEN :start_date AND :end_date
        """
    )
    row = db.execute(
        query,
        {"business_id": business_id, "start_date": start, "end_date": end},
    ).mappings().one()
    credits = _to_float(row["credits"])
    debits = _to_float(row["debits"])
    count = int(row["row_count"] or 0)
    return credits, debits, credits - debits, count


def _receivables(
    db: Session,
    business_id: str,
) -> dict[str, Any]:
    table_name = "invoices"
    result: dict[str, Any] = {
        "outstanding": 0.0,
        "overdue": 0.0,
        "due_7d": 0.0,
        "due_30d": 0.0,
        "collection_rate": None,
        "aging": [],
    }
    if not _table_exists(db, table_name):
        return result

    columns = _table_columns(db, table_name)
    business_col = _pick_column(columns, ["business_id", "businessId"])
    total_col = _pick_column(columns, ["total_amount", "amount", "grand_total"])
    paid_col = _pick_column(columns, ["amount_paid", "paid_amount", "received_amount"])
    due_col = _pick_column(columns, ["due_date", "payment_due_date", "expected_payment_date"])
    status_col = _pick_column(columns, ["status", "invoice_status"])
    created_col = _pick_column(columns, ["invoice_date", "issue_date", "created_at"])
    if not business_col or not total_col:
        return result

    selected = [
        f"{_quote_identifier(total_col)} AS total_amount",
        f"{_quote_identifier(paid_col)} AS paid_amount" if paid_col else "0 AS paid_amount",
        f"{_quote_identifier(due_col)} AS due_date" if due_col else "NULL AS due_date",
        f"{_quote_identifier(status_col)} AS status" if status_col else "NULL AS status",
        f"{_quote_identifier(created_col)} AS created_at" if created_col else "NULL AS created_at",
    ]
    rows = db.execute(
        text(
            f"""
            SELECT {', '.join(selected)}
            FROM {_quote_identifier(table_name)}
            WHERE {_quote_identifier(business_col)} = :business_id
            """
        ),
        {"business_id": business_id},
    ).mappings().all()

    today = date.today()
    buckets = {"0-7 days": 0.0, "8-30 days": 0.0, "31-60 days": 0.0, "60+ days": 0.0}
    gross = 0.0
    collected = 0.0

    for row in rows:
        total = max(0.0, _to_float(row["total_amount"]))
        paid = max(0.0, _to_float(row["paid_amount"]))
        outstanding = max(0.0, total - paid)
        gross += total
        collected += min(total, paid)
        if outstanding <= 0:
            continue

        result["outstanding"] += outstanding
        due = _date_value(row["due_date"])
        status = str(row["status"] or "").lower()
        overdue = status == "overdue" or (due is not None and due < today)
        if overdue:
            result["overdue"] += outstanding
        if due is not None:
            days = (due - today).days
            if 0 <= days <= 7:
                result["due_7d"] += outstanding
                buckets["0-7 days"] += outstanding
            elif 7 < days <= 30:
                result["due_30d"] += outstanding
                buckets["8-30 days"] += outstanding
            elif days > 30:
                buckets["31-60 days"] += outstanding
            else:
                buckets["60+ days"] += outstanding

    result["collection_rate"] = round((collected / gross) * 100.0, 1) if gross > 0 else None
    result["aging"] = [
        {"label": label, "amount": round(amount, 2)}
        for label, amount in buckets.items()
    ]
    return {key: round(value, 2) if isinstance(value, float) else value for key, value in result.items()}


def _payables(
    db: Session,
    business_id: str,
) -> dict[str, Any]:
    for table_name in ("purchases", "vendor_bills", "expenses"):
        if not _table_exists(db, table_name):
            continue
        columns = _table_columns(db, table_name)
        business_col = _pick_column(columns, ["business_id", "businessId"])
        total_col = _pick_column(columns, ["total_amount", "amount", "grand_total", "total"])
        paid_col = _pick_column(columns, ["amount_paid", "paid_amount", "paid"])
        due_col = _pick_column(columns, ["due_date", "payment_due_date", "expected_payment_date"])
        status_col = _pick_column(columns, ["status", "expense_status"])
        if not business_col or not total_col:
            continue

        selected = [
            f"{_quote_identifier(total_col)} AS total_amount",
            f"{_quote_identifier(paid_col)} AS paid_amount" if paid_col else "0 AS paid_amount",
            f"{_quote_identifier(due_col)} AS due_date" if due_col else "NULL AS due_date",
            f"{_quote_identifier(status_col)} AS status" if status_col else "NULL AS status",
        ]
        rows = db.execute(
            text(
                f"""
                SELECT {', '.join(selected)}
                FROM {_quote_identifier(table_name)}
                WHERE {_quote_identifier(business_col)} = :business_id
                """
            ),
            {"business_id": business_id},
        ).mappings().all()

        today = date.today()
        result = {"outstanding": 0.0, "overdue": 0.0, "due_7d": 0.0, "due_30d": 0.0, "aging": []}
        buckets = {"0-7 days": 0.0, "8-30 days": 0.0, "31-60 days": 0.0, "60+ days": 0.0}
        for row in rows:
            outstanding = max(0.0, _to_float(row["total_amount"]) - _to_float(row["paid_amount"]))
            if outstanding <= 0:
                continue
            result["outstanding"] += outstanding
            due = _date_value(row["due_date"])
            status = str(row["status"] or "").lower()
            overdue = status == "overdue" or (due is not None and due < today)
            if overdue:
                result["overdue"] += outstanding
            if due is not None:
                days = (due - today).days
                if 0 <= days <= 7:
                    result["due_7d"] += outstanding
                    buckets["0-7 days"] += outstanding
                elif 7 < days <= 30:
                    result["due_30d"] += outstanding
                    buckets["8-30 days"] += outstanding
                elif days > 30:
                    buckets["31-60 days"] += outstanding
                else:
                    buckets["60+ days"] += outstanding
        result["aging"] = [{"label": k, "amount": round(v, 2)} for k, v in buckets.items()]
        return {key: round(value, 2) if isinstance(value, float) else value for key, value in result.items()}

    return {"outstanding": 0.0, "overdue": 0.0, "due_7d": 0.0, "due_30d": 0.0, "aging": []}


def _payment_methods(
    db: Session,
    business_id: str,
    start: date,
    end: date,
) -> list[dict[str, Any]]:
    for table_name in ("invoice_payments", "payments", "bank_transactions"):
        if not _table_exists(db, table_name):
            continue
        columns = _table_columns(db, table_name)
        business_col = _pick_column(columns, ["business_id", "businessId"])
        date_col = _pick_column(columns, ["payment_date", "transaction_date", "date", "created_at"])
        amount_col = _pick_column(columns, ["amount", "total_amount", "transaction_amount"])
        method_col = _pick_column(columns, ["payment_method", "method", "mode", "category"])
        if not business_col or not date_col or not amount_col or not method_col:
            continue

        rows = db.execute(
            text(
                f"""
                SELECT {_quote_identifier(method_col)} AS method,
                       COUNT(*) AS count,
                       COALESCE(SUM(ABS({_quote_identifier(amount_col)})), 0) AS amount
                FROM {_quote_identifier(table_name)}
                WHERE {_quote_identifier(business_col)} = :business_id
                  AND DATE({_quote_identifier(date_col)}) BETWEEN :start_date AND :end_date
                GROUP BY {_quote_identifier(method_col)}
                ORDER BY amount DESC
                """
            ),
            {"business_id": business_id, "start_date": start, "end_date": end},
        ).mappings().all()
        return [
            {"method": str(row["method"] or "Unknown"), "count": int(row["count"] or 0), "amount": round(_to_float(row["amount"]), 2)}
            for row in rows
        ]
    return []


def _risk_exposure(db: Session, business_id: str) -> dict[str, float]:
    table_name = "risk_results"
    result = {"low": 0.0, "medium": 0.0, "high": 0.0, "unknown": 0.0}
    if not _table_exists(db, table_name):
        return result
    columns = _table_columns(db, table_name)
    business_col = _pick_column(columns, ["business_id", "businessId"])
    level_col = _pick_column(columns, ["risk_level", "level", "risk"])
    score_col = _pick_column(columns, ["risk_score", "score", "probability"])
    if not business_col:
        return result
    select_score = f"ABS({_quote_identifier(score_col)}) AS score" if score_col else "0 AS score"
    rows = db.execute(
        text(
            f"""
            SELECT {_quote_identifier(level_col)} AS risk_level, {select_score}
            FROM {_quote_identifier(table_name)}
            WHERE {_quote_identifier(business_col)} = :business_id
            """ if level_col else f"""
            SELECT NULL AS risk_level, {select_score}
            FROM {_quote_identifier(table_name)}
            WHERE {_quote_identifier(business_col)} = :business_id
            """
        ),
        {"business_id": business_id},
    ).mappings().all()
    for row in rows:
        level = str(row["risk_level"] or "unknown").lower()
        score = _to_float(row["score"])
        if level not in result:
            level = "high" if score >= 0.7 else "medium" if score >= 0.4 else "low" if score >= 0 else "unknown"
        result[level] += score if score else 1.0
    return {key: round(value, 2) for key, value in result.items()}


def _series(
    db: Session,
    business_id: str,
    start: date,
    end: date,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    days = (end - start).days + 1
    if days > 90:
        step = 7
    else:
        step = 1

    cash: list[dict[str, Any]] = []
    rev_exp: list[dict[str, Any]] = []
    cursor = start
    while cursor <= end:
        bucket_end = min(end, cursor + timedelta(days=step - 1))
        credits, debits, bank_net, _ = _bank_summary(db, business_id, cursor, bucket_end)
        revenue = _revenue(db, business_id, cursor, bucket_end)
        expenses = _expenses(db, business_id, cursor, bucket_end)
        inflow = credits if credits > 0 or debits > 0 else revenue
        outflow = debits if credits > 0 or debits > 0 else expenses
        label = cursor.strftime("%d %b") if step == 1 else f"{cursor.strftime('%d %b')}"
        cash.append({"label": label, "inflow": round(inflow, 2), "outflow": round(outflow, 2), "net": round(bank_net if credits > 0 or debits > 0 else inflow - outflow, 2)})
        rev_exp.append({"label": label, "revenue": round(revenue, 2), "expenses": round(expenses, 2)})
        cursor = bucket_end + timedelta(days=1)
    return cash, rev_exp


def _build_deterministic_signals(
    *,
    revenue: float,
    expenses: float,
    net_cash: float,
    receivables: dict[str, Any],
    payables: dict[str, Any],
    risk: dict[str, float],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    insights: list[dict[str, Any]] = []
    signals: list[dict[str, Any]] = []

    if receivables.get("overdue", 0) > 0:
        insights.append({
            "id": "receivables-overdue",
            "title": "Overdue receivables require collection attention",
            "text": f"Outstanding overdue receivables are ₹{receivables['overdue']:,.0f}.",
            "severity": "high" if receivables["overdue"] > max(revenue * 0.15, 1) else "medium",
            "source": "invoices",
        })
    if payables.get("due_7d", 0) > 0:
        insights.append({
            "id": "payables-next-7d",
            "title": "Near-term supplier obligations are visible",
            "text": f"₹{payables['due_7d']:,.0f} is due within the next 7 days.",
            "severity": "medium",
            "source": "payables",
        })
    if net_cash < 0:
        insights.append({
            "id": "negative-net-cash",
            "title": "Net cash movement is negative",
            "text": f"The selected period shows net cash movement of ₹{net_cash:,.0f}.",
            "severity": "high",
            "source": "bank_transactions" if net_cash != revenue - expenses else "sales_vs_expenses",
        })
    if revenue > 0 and expenses > revenue:
        insights.append({
            "id": "expense-pressure",
            "title": "Expenses are above recorded revenue",
            "text": f"Recorded expenses of ₹{expenses:,.0f} exceed revenue of ₹{revenue:,.0f}.",
            "severity": "high",
            "source": "sales_and_expenses",
        })
    if risk.get("high", 0) > 0:
        insights.append({
            "id": "high-risk-exposure",
            "title": "High-risk signals are present",
            "text": f"Risk engine reports a high-risk exposure score of {risk['high']:,.0f}.",
            "severity": "high",
            "source": "risk_results",
        })
    if revenue > 0 and expenses <= revenue and net_cash >= 0:
        insights.append({
            "id": "positive-cash-control",
            "title": "Selected period shows positive operating movement",
            "text": "Revenue and cash movement currently remain above recorded expenses.",
            "severity": "low",
            "source": "live_mysql",
        })

    signals.append({"id": "signal-revenue", "title": "Revenue", "value": f"₹{revenue:,.0f}", "detail": "Recorded live revenue for the selected period.", "severity": "low" if revenue > 0 else "unknown"})
    signals.append({"id": "signal-expenses", "title": "Expenses", "value": f"₹{expenses:,.0f}", "detail": "Recorded live expenses for the selected period.", "severity": "medium" if expenses > revenue and revenue > 0 else "low"})
    signals.append({"id": "signal-receivables", "title": "Overdue receivables", "value": f"₹{receivables.get('overdue', 0):,.0f}", "detail": "Open invoices whose due date has passed or status is overdue.", "severity": "high" if receivables.get("overdue", 0) > 0 else "low"})
    signals.append({"id": "signal-payables", "title": "Payables due in 7 days", "value": f"₹{payables.get('due_7d', 0):,.0f}", "detail": "Recorded supplier obligations due within seven days.", "severity": "medium" if payables.get("due_7d", 0) > 0 else "low"})
    signals.append({"id": "signal-cash", "title": "Net cash flow", "value": f"₹{net_cash:,.0f}", "detail": "Live bank movement when transactions exist; otherwise revenue minus expenses.", "severity": "high" if net_cash < 0 else "low"})
    return insights[:8], signals[:8]


# ============================================================================
# OPTIONAL ML FORECAST
# ============================================================================


def _ml_forecast(business_id: str, horizon_days: int) -> tuple[list[dict[str, Any]], str | None, int | None]:
    base = os.getenv("CASHGUARD_ML_BASE_URL", "http://127.0.0.1:8001").rstrip("/")
    url = f"{base}/predict/cash-flow"
    try:
        response = requests.get(
            url,
            params={"business_id": business_id, "horizon_days": horizon_days},
            timeout=3,
        )
        response.raise_for_status()
        payload = response.json()
        rows = payload.get("forecast") or payload.get("data") or payload.get("predictions") or []
        normalized: list[dict[str, Any]] = []
        if isinstance(rows, list):
            for row in rows:
                if not isinstance(row, dict):
                    continue
                normalized.append({
                    "label": str(row.get("label") or row.get("date") or row.get("ds") or ""),
                    "value": _to_float(row.get("value", row.get("prediction", row.get("yhat")))) if row.get("value", row.get("prediction", row.get("yhat"))) is not None else None,
                })
        model = payload.get("model") or payload.get("model_version")
        count = len(normalized)
        return normalized, str(model) if model else None, count
    except Exception as exc:
        logger.info("Analytics ML service unavailable: %s", exc)
        return [], None, None


# ============================================================================
# OVERVIEW
# ============================================================================


def _build_overview(
    db: Session,
    business_id: str,
    range_value: str,
    compare: str,
    metric: str,
    risk_filter: str,
    scope: str,
    method: str,
) -> dict[str, Any]:
    del metric, risk_filter, scope, method  # Filter values are preserved in the request contract; data is still live.

    start, end = _period_bounds(range_value)
    comparison = _comparison_bounds(range_value, compare)

    revenue = _revenue(db, business_id, start, end)
    expenses = _expenses(db, business_id, start, end)
    credits, debits, bank_net, bank_count = _bank_summary(db, business_id, start, end)
    receivables = _receivables(db, business_id)
    payables = _payables(db, business_id)

    net_cash = bank_net if bank_count > 0 else revenue - expenses
    gross_margin = ((revenue - expenses) / revenue * 100.0) if revenue > 0 else None

    previous_revenue = previous_expenses = previous_net_cash = None
    if comparison:
        prev_start, prev_end = comparison
        previous_revenue = _revenue(db, business_id, prev_start, prev_end)
        previous_expenses = _expenses(db, business_id, prev_start, prev_end)
        prev_credit, prev_debit, prev_bank_net, prev_count = _bank_summary(db, business_id, prev_start, prev_end)
        previous_net_cash = prev_bank_net if prev_count > 0 else previous_revenue - previous_expenses

    cash_flow, revenue_vs_expenses = _series(db, business_id, start, end)
    payment_methods = _payment_methods(db, business_id, start, end)
    risk = _risk_exposure(db, business_id)
    insights, financial_signals = _build_deterministic_signals(
        revenue=revenue,
        expenses=expenses,
        net_cash=net_cash,
        receivables=receivables,
        payables=payables,
        risk=risk,
    )

    ml_forecast, ml_model, ml_count = _ml_forecast(business_id, min(_period_days(range_value), 30))
    available_records = bank_count
    data_sources = ["invoices", "expenses"]
    if _table_exists(db, "sales"):
        data_sources.append("sales")
    if bank_count:
        data_sources.append("bank_transactions")
    if _table_exists(db, "risk_results"):
        data_sources.append("risk_results")

    return {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "currency": "INR",
        "kpis": {
            "revenue": {"value": round(revenue, 2), "change_percent": _metric_change(revenue, previous_revenue), "detail": "Live sales/invoice revenue."},
            "expenses": {"value": round(expenses, 2), "change_percent": _metric_change(expenses, previous_expenses), "detail": "Live recorded expenses."},
            "net_cash_flow": {"value": round(net_cash, 2), "change_percent": _metric_change(net_cash, previous_net_cash), "detail": "Bank movement where available; otherwise revenue minus expenses."},
            "gross_margin": {"value": round(gross_margin, 1) if gross_margin is not None else None, "change_percent": None, "detail": "Revenue less recorded expenses as a percentage of revenue."},
            "receivables": {"value": round(receivables.get("outstanding", 0), 2), "change_percent": None, "detail": "Open customer receivables."},
            "payables": {"value": round(payables.get("outstanding", 0), 2), "change_percent": None, "detail": "Open supplier obligations where payable data is available."},
        },
        "cash_flow": cash_flow,
        "revenue_vs_expenses": revenue_vs_expenses,
        "receivables": receivables,
        "payables": payables,
        "payment_methods": payment_methods,
        "risk_exposure": risk,
        "insights": insights,
        "financial_signals": financial_signals,
        "ml": {
            "cash_flow_forecast": ml_forecast,
            "payment_delay_risk": None,
            "anomaly_count": None,
            "model": ml_model,
        },
        "data_quality": {
            "status": "ready" if revenue or expenses or receivables.get("outstanding") or bank_count else "partial",
            "warning": None if (revenue or expenses or receivables.get("outstanding") or bank_count) else "No usable business records were returned for the selected business.",
            "record_count": available_records,
            "last_updated": datetime.utcnow().isoformat() + "Z",
            "sources": data_sources,
        },
    }


# ============================================================================
# GENAI INSIGHT
# ============================================================================


def _genai_summary(overview: dict[str, Any], intent: str) -> dict[str, Any]:
    candidates = overview.get("insights") or []
    allowed_ids = {str(item.get("id")) for item in candidates if item.get("id")}
    model_name = "cashguard-rule-engine"

    fallback = {
        "title": "CashGuard financial intelligence",
        "executive_summary": "The selected period has been analysed from live CashGuard business records.",
        "risks": [item.get("text", "") for item in candidates if item.get("severity") == "high"],
        "opportunities": [
            "Prioritise collection of overdue receivables." if overview.get("receivables", {}).get("overdue", 0) > 0 else "Continue monitoring cash conversion.",
        ],
        "actions": [
            "Review overdue receivables and near-term payables.",
            "Monitor net cash movement against recorded expenses.",
        ],
        "model": model_name,
        "generated_at": datetime.utcnow().isoformat() + "Z",
    }

    if not os.getenv("LLM_API_KEY") or not os.getenv("LLM_MODEL") or not os.getenv("LLM_BASE_URL"):
        return fallback

    system_prompt = """
You are CashGuard AI for Indian MSMEs.
Use only the supplied live structured financial intelligence.
Do not invent numbers, customers, transactions, forecasts, causes, or thresholds.
Return ONLY valid JSON with:
{
  \"title\": string,
  \"executive_summary\": string,
  \"risks\": [string],
  \"opportunities\": [string],
  \"actions\": [string]
}
Keep the answer concise and operational.
""".strip()
    prompt = json.dumps(
        {
            "intent": intent,
            "allowed_candidate_ids": sorted(allowed_ids),
            "overview": overview,
        },
        ensure_ascii=False,
        default=str,
    )

    try:
        result = ollama_service.generate(prompt=prompt, system_prompt=system_prompt)
        raw = result.get("response", "") if isinstance(result, dict) else ""
        parsed = json.loads(raw)
        if not isinstance(parsed, dict):
            return fallback
        risks = parsed.get("risks") if isinstance(parsed.get("risks"), list) else []
        opportunities = parsed.get("opportunities") if isinstance(parsed.get("opportunities"), list) else []
        actions = parsed.get("actions") if isinstance(parsed.get("actions"), list) else []
        return {
            "title": str(parsed.get("title") or fallback["title"]),
            "executive_summary": str(parsed.get("executive_summary") or fallback["executive_summary"]),
            "risks": [str(x) for x in risks[:6]],
            "opportunities": [str(x) for x in opportunities[:6]],
            "actions": [str(x) for x in actions[:6]],
            "model": str(result.get("model") or os.getenv("LLM_MODEL") or model_name),
            "generated_at": datetime.utcnow().isoformat() + "Z",
        }
    except Exception as exc:
        logger.warning("Analytics GenAI insight unavailable: %s", exc)
        return fallback


# ============================================================================
# MINIMAL PDF REPORT (NO EXTRA DEPENDENCY)
# ============================================================================


def _make_pdf(title: str, lines: list[str]) -> bytes:
    content_lines = [title, "", *lines]
    escaped: list[str] = []
    y = 790
    for line in content_lines:
        wrapped = textwrap.wrap(str(line), width=90) or [""]
        for part in wrapped:
            safe = part.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
            escaped.append(f"BT /F1 10 Tf 40 {y} Td ({safe}) Tj ET")
            y -= 14
            if y < 40:
                break
        if y < 40:
            break

    stream = "\n".join(escaped).encode("latin-1", errors="replace")
    objects: list[bytes] = []
    objects.append(b"1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n")
    objects.append(b"2 0 obj << /Type /Pages /Count 1 /Kids [3 0 R] >> endobj\n")
    objects.append(b"3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj\n")
    objects.append(b"4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n")
    objects.append(b"5 0 obj << /Length " + str(len(stream)).encode("ascii") + b" >> stream\n" + stream + b"\nendstream\nendobj\n")

    pdf = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for obj in objects:
        offsets.append(len(pdf))
        pdf.extend(obj)
    xref_start = len(pdf)
    pdf.extend(f"xref\n0 {len(objects)+1}\n".encode("ascii"))
    pdf.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        pdf.extend(f"{offset:010d} 00000 n \n".encode("ascii"))
    pdf.extend(
        f"trailer\n<< /Size {len(objects)+1} /Root 1 0 R >>\nstartxref\n{xref_start}\n%%EOF".encode("ascii")
    )
    return bytes(pdf)


# ============================================================================
# ROUTES
# ============================================================================


@router.get("/overview")
def analytics_overview(
    business_id: str | None = Query(default=None),
    range: str = Query(default="30d", pattern="^(7d|30d|quarter|year)$"),
    compare: str = Query(default="previous_period", pattern="^(previous_period|previous_year|none)$"),
    metric: str = Query(default="all"),
    risk: str = Query(default="all"),
    scope: str = Query(default="all"),
    method: str = Query(default="all"),
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_authenticated_user),
) -> dict[str, Any]:
    business = _authorized_business_id(business_id, current_user, db)
    overview = _build_overview(
        db,
        business,
        range,
        compare,
        metric,
        risk,
        scope,
        method,
    )
    overview["business_id"] = business
    overview["filters"] = {
        "range": range,
        "compare": compare,
        "metric": metric,
        "risk": risk,
        "scope": scope,
        "method": method,
    }
    return {"success": True, "data": overview}


@router.get("/ai/insight")
def analytics_ai_insight(
    business_id: str | None = Query(default=None),
    range: str = Query(default="30d", pattern="^(7d|30d|quarter|year)$"),
    compare: str = Query(default="previous_period", pattern="^(previous_period|previous_year|none)$"),
    metric: str = Query(default="all"),
    risk: str = Query(default="all"),
    scope: str = Query(default="all"),
    method: str = Query(default="all"),
    intent: str = Query(default="current_period", max_length=80),
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_authenticated_user),
) -> dict[str, Any]:
    business = _authorized_business_id(business_id, current_user, db)
    overview = _build_overview(db, business, range, compare, metric, risk, scope, method)
    insight = _genai_summary(overview, intent)
    return {"success": True, "data": insight}


@router.post("/report")
def analytics_report(
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    current_user: Any = Depends(get_authenticated_user),
) -> Response:
    business = _authorized_business_id(payload.get("business_id"), current_user, db)
    range_value = str(payload.get("range") or "30d")
    compare = str(payload.get("compare") or "previous_period")
    metric = str(payload.get("metric") or "all")
    risk = str(payload.get("risk") or "all")
    scope = str(payload.get("scope") or "all")
    method = str(payload.get("method") or "all")

    if range_value not in {"7d", "30d", "quarter", "year"}:
        raise HTTPException(status_code=400, detail="Invalid analytics range.")
    if compare not in {"previous_period", "previous_year", "none"}:
        raise HTTPException(status_code=400, detail="Invalid comparison mode.")

    overview = _build_overview(db, business, range_value, compare, metric, risk, scope, method)
    kpis = overview["kpis"]
    lines = [
        f"Business ID: {business}",
        f"Period: {range_value} | Comparison: {compare}",
        "",
        f"Revenue: ₹{_to_float(kpis['revenue']['value']):,.2f}",
        f"Expenses: ₹{_to_float(kpis['expenses']['value']):,.2f}",
        f"Net cash flow: ₹{_to_float(kpis['net_cash_flow']['value']):,.2f}",
        f"Gross margin: {kpis['gross_margin']['value'] if kpis['gross_margin']['value'] is not None else 'N/A'}%",
        f"Receivables: ₹{_to_float(kpis['receivables']['value']):,.2f}",
        f"Payables: ₹{_to_float(kpis['payables']['value']):,.2f}",
        f"Overdue receivables: ₹{_to_float(overview['receivables'].get('overdue')):,.2f}",
        f"Payables due in 7 days: ₹{_to_float(overview['payables'].get('due_7d')):,.2f}",
        "",
        "Financial signals:",
    ]
    for signal in overview.get("financial_signals", [])[:8]:
        lines.append(f"- {signal['title']}: {signal['value']} ({signal['severity']})")
    lines.append("")
    lines.append("Business insights:")
    for insight in overview.get("insights", [])[:8]:
        lines.append(f"- {insight['title']}: {insight['text']}")

    pdf = _make_pdf("CashGuard-AI Analytics Report", lines)
    filename = f"cashguard-analytics-{date.today().isoformat()}-{uuid.uuid4().hex[:8]}.pdf"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
