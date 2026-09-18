from datetime import date
from decimal import Decimal
from typing import Any

from fastapi import APIRouter

from database import get_connection


router = APIRouter(
    prefix="/dashboard",
    tags=["Dashboard"],
)


def decimal_to_float(value: Any) -> float:
    if isinstance(value, Decimal):
        return float(value)

    if value is None:
        return 0.0

    return float(value)


# ============================================================
# SUMMARY
# ============================================================

@router.get("/summary")
def dashboard_summary(period: str = "6m"):
    connection = get_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        cursor.execute(
            """
            SELECT
                COALESCE(SUM(amount), 0) AS total_balance
            FROM bank_transactions
            """
        )

        balance_row = cursor.fetchone() or {}

        cursor.execute(
            """
            SELECT
                COALESCE(
                    SUM(CASE
                        WHEN status NOT IN ('paid', 'PAID')
                        THEN total_amount
                        ELSE 0
                    END),
                    0
                ) AS receivables
            FROM invoices
            """
        )

        receivable_row = cursor.fetchone() or {}

        cursor.execute(
            """
            SELECT
                COALESCE(
                    SUM(total_amount),
                    0
                ) AS payables
            FROM purchases
            """
        )

        payable_row = cursor.fetchone() or {}

        cursor.execute(
            """
            SELECT
                COALESCE(SUM(total_amount), 0) AS income
            FROM sales
            """
        )

        income_row = cursor.fetchone() or {}

        cursor.execute(
            """
            SELECT
                COALESCE(SUM(amount), 0) AS expenses
            FROM expenses
            """
        )

        expense_row = cursor.fetchone() or {}

        balance = decimal_to_float(
            balance_row.get("total_balance")
        )

        receivables = decimal_to_float(
            receivable_row.get("receivables")
        )

        payables = decimal_to_float(
            payable_row.get("payables")
        )

        income = decimal_to_float(
            income_row.get("income")
        )

        expenses = decimal_to_float(
            expense_row.get("expenses")
        )

        return {
            "total_balance": balance,
            "available_cash": balance,
            "total_receivables": receivables,
            "total_payables": payables,
            "overdue_receivables": 0,
            "overdue_payables": 0,
            "monthly_income": income,
            "monthly_expenses": expenses,
            "net_cash_flow": income - expenses,
        }

    finally:
        cursor.close()
        connection.close()


# ============================================================
# CASH FLOW
# ============================================================

@router.get("/cash-flow")
def dashboard_cash_flow(period: str = "6m"):
    connection = get_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        cursor.execute(
            """
            SELECT
                DATE_FORMAT(transaction_date, '%b %Y') AS month,
                SUM(
                    CASE
                        WHEN transaction_type IN
                            ('credit', 'income', 'deposit')
                        THEN amount
                        ELSE 0
                    END
                ) AS inflow,
                SUM(
                    CASE
                        WHEN transaction_type IN
                            ('debit', 'expense', 'withdrawal')
                        THEN amount
                        ELSE 0
                    END
                ) AS outflow
            FROM bank_transactions
            GROUP BY
                YEAR(transaction_date),
                MONTH(transaction_date)
            ORDER BY
                YEAR(transaction_date),
                MONTH(transaction_date)
            LIMIT 12
            """
        )

        rows = cursor.fetchall()

        result = []

        for row in rows:
            inflow = decimal_to_float(
                row.get("inflow")
            )

            outflow = decimal_to_float(
                row.get("outflow")
            )

            result.append(
                {
                    "label": row.get("month"),
                    "month": row.get("month"),
                    "inflow": inflow,
                    "outflow": outflow,
                    "net": inflow - outflow,
                }
            )

        return result

    finally:
        cursor.close()
        connection.close()


# ============================================================
# RECENT TRANSACTIONS
# ============================================================

@router.get("/recent-transactions")
def recent_transactions(limit: int = 8):
    connection = get_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        cursor.execute(
            """
            SELECT
                id,
                transaction_type,
                amount,
                reference,
                description,
                transaction_date
            FROM bank_transactions
            ORDER BY transaction_date DESC
            LIMIT %s
            """,
            (limit,),
        )

        rows = cursor.fetchall()

        result = []

        for row in rows:
            result.append(
                {
                    "id": row.get("id"),
                    "reference": row.get("reference"),
                    "description": row.get("description"),
                    "type": row.get("transaction_type"),
                    "amount": decimal_to_float(
                        row.get("amount")
                    ),
                    "transaction_date": (
                        row.get("transaction_date").isoformat()
                        if hasattr(
                            row.get("transaction_date"),
                            "isoformat",
                        )
                        else row.get("transaction_date")
                    ),
                }
            )

        return result

    finally:
        cursor.close()
        connection.close()


# ============================================================
# ALERTS
# ============================================================

@router.get("/alerts")
def dashboard_alerts(limit: int = 6):
    connection = get_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        cursor.execute(
            """
            SELECT
                id,
                title,
                message,
                severity,
                created_at
            FROM alerts
            ORDER BY created_at DESC
            LIMIT %s
            """,
            (limit,),
        )

        rows = cursor.fetchall()

        result = []

        for row in rows:
            result.append(
                {
                    "id": row.get("id"),
                    "title": row.get("title"),
                    "message": row.get("message"),
                    "severity": row.get("severity"),
                    "created_at": (
                        row.get("created_at").isoformat()
                        if hasattr(
                            row.get("created_at"),
                            "isoformat",
                        )
                        else row.get("created_at")
                    ),
                }
            )

        return result

    finally:
        cursor.close()
        connection.close()