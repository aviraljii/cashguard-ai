from __future__ import annotations

from datetime import date, datetime
from typing import Any

from database import get_database_connection


class DashboardService:
    """
    Service layer for CashGuard-AI dashboard.

    Reads live financial data from the existing MySQL database
    and returns a frontend-friendly dashboard response.
    """

    # ========================================================================
    # HELPERS
    # ========================================================================

    def _get_date_column(
        self,
        cursor,
        table_name: str,
    ) -> str | None:
        """
        Automatically detect the most suitable date/datetime column
        from a database table.
        """

        cursor.execute(
            """
            SELECT
                COLUMN_NAME,
                DATA_TYPE,
                ORDINAL_POSITION
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = %s
              AND DATA_TYPE IN (
                  'date',
                  'datetime',
                  'timestamp'
              )
            ORDER BY
                CASE
                    WHEN LOWER(COLUMN_NAME) IN (
                        'date',
                        'transaction_date',
                        'invoice_date',
                        'sale_date',
                        'expense_date',
                        'payment_date',
                        'flow_date',
                        'cash_flow_date',
                        'business_date',
                        'due_date',
                        'created_at',
                        'updated_at'
                    )
                    THEN 0
                    ELSE 1
                END,
                ORDINAL_POSITION
            """,
            (table_name,),
        )

        rows = cursor.fetchall() or []

        if not rows:
            return None

        return rows[0]["COLUMN_NAME"]

    def _table_exists(
        self,
        cursor,
        table_name: str,
    ) -> bool:
        """
        Check whether a table exists in the current database.
        """

        cursor.execute(
            """
            SELECT COUNT(*) AS table_count
            FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = %s
            """,
            (table_name,),
        )

        row = cursor.fetchone() or {}

        return int(
            row.get("table_count") or 0
        ) > 0

    def _column_exists(
        self,
        cursor,
        table_name: str,
        column_name: str,
    ) -> bool:
        """
        Check whether a specific column exists.
        """

        cursor.execute(
            """
            SELECT COUNT(*) AS column_count
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = %s
              AND COLUMN_NAME = %s
            """,
            (
                table_name,
                column_name,
            ),
        )

        row = cursor.fetchone() or {}

        return int(
            row.get("column_count") or 0
        ) > 0

    def _safe_float(
        self,
        value: Any,
    ) -> float:
        try:
            return float(value or 0)
        except (TypeError, ValueError):
            return 0.0

    def _safe_int(
        self,
        value: Any,
    ) -> int:
        try:
            return int(value or 0)
        except (TypeError, ValueError):
            return 0

    # ========================================================================
    # MAIN DASHBOARD
    # ========================================================================

    def get_dashboard(
        self,
    ) -> dict[str, Any]:
        """
        Build the complete live dashboard response from MySQL.
        """

        with get_database_connection() as connection:
            cursor = connection.cursor(
                dictionary=True
            )

            try:
                # ============================================================
                # REVENUE
                # ============================================================

                revenue = 0.0

                if self._table_exists(
                    cursor,
                    "sales",
                ):
                    status_filter = ""

                    if self._column_exists(
                        cursor,
                        "sales",
                        "status",
                    ):
                        status_filter = """
                            WHERE LOWER(status) = 'completed'
                        """

                    cursor.execute(
                        f"""
                        SELECT
                            COALESCE(
                                SUM(total_amount),
                                0
                            ) AS total_revenue
                        FROM sales
                        {status_filter}
                        """
                    )

                    row = (
                        cursor.fetchone()
                        or {}
                    )

                    revenue = self._safe_float(
                        row.get(
                            "total_revenue"
                        )
                    )

                # ============================================================
                # EXPENSES
                # ============================================================

                expenses = 0.0

                if self._table_exists(
                    cursor,
                    "expenses",
                ):
                    cursor.execute(
                        """
                        SELECT
                            COALESCE(
                                SUM(amount),
                                0
                            ) AS total_expenses
                        FROM expenses
                        """
                    )

                    row = (
                        cursor.fetchone()
                        or {}
                    )

                    expenses = self._safe_float(
                        row.get(
                            "total_expenses"
                        )
                    )

                # ============================================================
                # RECEIVABLES
                # ============================================================

                receivables = 0.0

                if self._table_exists(
                    cursor,
                    "invoices",
                ):
                    cursor.execute(
                        """
                        SELECT
                            COALESCE(
                                SUM(
                                    GREATEST(
                                        COALESCE(total_amount, 0)
                                        -
                                        COALESCE(amount_paid, 0),
                                        0
                                    )
                                ),
                                0
                            ) AS total_receivables
                        FROM invoices
                        WHERE LOWER(
                            COALESCE(status, '')
                        ) NOT IN (
                            'paid',
                            'cancelled',
                            'canceled'
                        )
                        """
                    )

                    row = (
                        cursor.fetchone()
                        or {}
                    )

                    receivables = self._safe_float(
                        row.get(
                            "total_receivables"
                        )
                    )

                # ============================================================
                # OVERDUE RECEIVABLES
                # ============================================================

                overdue = 0.0

                if self._table_exists(
                    cursor,
                    "invoices",
                ):
                    invoice_date_column = (
                        self._get_date_column(
                            cursor,
                            "invoices",
                        )
                    )

                    if invoice_date_column:
                        cursor.execute(
                            f"""
                            SELECT
                                COALESCE(
                                    SUM(
                                        GREATEST(
                                            COALESCE(
                                                total_amount,
                                                0
                                            )
                                            -
                                            COALESCE(
                                                amount_paid,
                                                0
                                            ),
                                            0
                                        )
                                    ),
                                    0
                                ) AS overdue_amount

                            FROM invoices

                            WHERE LOWER(
                                COALESCE(status, '')
                            ) NOT IN (
                                'paid',
                                'cancelled',
                                'canceled'
                            )

                            AND `{invoice_date_column}` < CURRENT_DATE
                            """
                        )

                        row = (
                            cursor.fetchone()
                            or {}
                        )

                        overdue = self._safe_float(
                            row.get(
                                "overdue_amount"
                            )
                        )

                # ============================================================
                # COLLECTIONS
                # ============================================================

                collected = 0.0

                if self._table_exists(
                    cursor,
                    "invoice_payments",
                ):
                    cursor.execute(
                        """
                        SELECT
                            COALESCE(
                                SUM(amount),
                                0
                            ) AS total_collected
                        FROM invoice_payments
                        """
                    )

                    row = (
                        cursor.fetchone()
                        or {}
                    )

                    collected = self._safe_float(
                        row.get(
                            "total_collected"
                        )
                    )

                # ============================================================
                # PAYABLES
                # ============================================================

                payables = 0.0

                if self._table_exists(
                    cursor,
                    "purchases",
                ):
                    purchase_columns = {}

                    cursor.execute(
                        """
                        SELECT
                            COLUMN_NAME
                        FROM INFORMATION_SCHEMA.COLUMNS
                        WHERE TABLE_SCHEMA = DATABASE()
                          AND TABLE_NAME = 'purchases'
                        """
                    )

                    for column_row in (
                        cursor.fetchall()
                        or []
                    ):
                        column_name = column_row.get(
                            "COLUMN_NAME"
                        )

                        if column_name:
                            purchase_columns[
                                column_name.lower()
                            ] = column_name

                    amount_column = None

                    for candidate in [
                        "total_amount",
                        "grand_total",
                        "amount",
                        "total",
                        "net_amount",
                    ]:
                        if (
                            candidate
                            in purchase_columns
                        ):
                            amount_column = (
                                purchase_columns[
                                    candidate
                                ]
                            )
                            break

                    paid_column = None

                    for candidate in [
                        "amount_paid",
                        "paid_amount",
                        "paid",
                    ]:
                        if (
                            candidate
                            in purchase_columns
                        ):
                            paid_column = (
                                purchase_columns[
                                    candidate
                                ]
                            )
                            break

                    if amount_column:
                        if paid_column:
                            purchase_query = f"""
                                SELECT
                                    COALESCE(
                                        SUM(
                                            GREATEST(
                                                COALESCE(
                                                    `{amount_column}`,
                                                    0
                                                )
                                                -
                                                COALESCE(
                                                    `{paid_column}`,
                                                    0
                                                ),
                                                0
                                            )
                                        ),
                                        0
                                    ) AS total_payables
                                FROM purchases
                            """
                        else:
                            purchase_query = f"""
                                SELECT
                                    COALESCE(
                                        SUM(
                                            COALESCE(
                                                `{amount_column}`,
                                                0
                                            )
                                        ),
                                        0
                                    ) AS total_payables
                                FROM purchases
                            """

                        cursor.execute(
                            purchase_query
                        )

                        row = (
                            cursor.fetchone()
                            or {}
                        )

                        payables = self._safe_float(
                            row.get(
                                "total_payables"
                            )
                        )

                # ============================================================
                # UPCOMING PAYMENTS
                # ============================================================

                upcoming = 0.0
                upcoming_count = 0

                if self._table_exists(
                    cursor,
                    "purchases",
                ):
                    purchase_date_column = (
                        self._get_date_column(
                            cursor,
                            "purchases",
                        )
                    )

                    if purchase_date_column:
                        purchase_columns = {}

                        cursor.execute(
                            """
                            SELECT
                                COLUMN_NAME
                            FROM INFORMATION_SCHEMA.COLUMNS
                            WHERE TABLE_SCHEMA = DATABASE()
                              AND TABLE_NAME = 'purchases'
                            """
                        )

                        for column_row in (
                            cursor.fetchall()
                            or []
                        ):
                            name = column_row.get(
                                "COLUMN_NAME"
                            )

                            if name:
                                purchase_columns[
                                    name.lower()
                                ] = name

                        amount_column = None

                        for candidate in [
                            "total_amount",
                            "grand_total",
                            "amount",
                            "total",
                            "net_amount",
                        ]:
                            if (
                                candidate
                                in purchase_columns
                            ):
                                amount_column = (
                                    purchase_columns[
                                        candidate
                                    ]
                                )
                                break

                        paid_column = None

                        for candidate in [
                            "amount_paid",
                            "paid_amount",
                            "paid",
                        ]:
                            if (
                                candidate
                                in purchase_columns
                            ):
                                paid_column = (
                                    purchase_columns[
                                        candidate
                                    ]
                                )
                                break

                        if amount_column:
                            balance_expression = (
                                f"""
                                GREATEST(
                                    COALESCE(
                                        `{amount_column}`,
                                        0
                                    )
                                    -
                                    COALESCE(
                                        `{paid_column}`,
                                        0
                                    ),
                                    0
                                )
                                """
                                if paid_column
                                else f"""
                                COALESCE(
                                    `{amount_column}`,
                                    0
                                )
                                """
                            )

                            cursor.execute(
                                f"""
                                SELECT
                                    COALESCE(
                                        SUM(
                                            {balance_expression}
                                        ),
                                        0
                                    ) AS upcoming_amount,

                                    COUNT(*) AS upcoming_count

                                FROM purchases

                                WHERE `{purchase_date_column}`
                                      >= CURRENT_DATE

                                AND `{purchase_date_column}`
                                      < DATE_ADD(
                                          CURRENT_DATE,
                                          INTERVAL 30 DAY
                                      )
                                """
                            )

                            row = (
                                cursor.fetchone()
                                or {}
                            )

                            upcoming = (
                                self._safe_float(
                                    row.get(
                                        "upcoming_amount"
                                    )
                                )
                            )

                            upcoming_count = (
                                self._safe_int(
                                    row.get(
                                        "upcoming_count"
                                    )
                                )
                            )

                # ============================================================
                # CASH FLOW
                # ============================================================

                cash_inflow = 0.0
                cash_outflow = 0.0
                net_cash_flow = 0.0

                if self._table_exists(
                    cursor,
                    "daily_cash_flow",
                ):
                    cash_flow_date_column = (
                        self._get_date_column(
                            cursor,
                            "daily_cash_flow",
                        )
                    )

                    if cash_flow_date_column:
                        cursor.execute(
                            f"""
                            SELECT
                                COALESCE(
                                    SUM(cash_inflow),
                                    0
                                ) AS cash_inflow,

                                COALESCE(
                                    SUM(cash_outflow),
                                    0
                                ) AS cash_outflow,

                                COALESCE(
                                    SUM(net_cash_flow),
                                    0
                                ) AS net_cash_flow

                            FROM daily_cash_flow

                            WHERE `{cash_flow_date_column}`
                                  <= CURRENT_DATE
                            """
                        )

                    else:
                        cursor.execute(
                            """
                            SELECT
                                COALESCE(
                                    SUM(cash_inflow),
                                    0
                                ) AS cash_inflow,

                                COALESCE(
                                    SUM(cash_outflow),
                                    0
                                ) AS cash_outflow,

                                COALESCE(
                                    SUM(net_cash_flow),
                                    0
                                ) AS net_cash_flow

                            FROM daily_cash_flow
                            """
                        )

                    row = (
                        cursor.fetchone()
                        or {}
                    )

                    cash_inflow = (
                        self._safe_float(
                            row.get(
                                "cash_inflow"
                            )
                        )
                    )

                    cash_outflow = (
                        self._safe_float(
                            row.get(
                                "cash_outflow"
                            )
                        )
                    )

                    net_cash_flow = (
                        self._safe_float(
                            row.get(
                                "net_cash_flow"
                            )
                        )
                    )

                # ============================================================
                # AVAILABLE CASH
                # ============================================================

                #
                # For the current system, the safest live cash position is:
                #
                # total historical inflow - total historical outflow
                #
                # This is based directly on daily_cash_flow.
                #

                cash = (
                    cash_inflow
                    - cash_outflow
                )

                # Never show a negative value as "available cash"
                # when the data source does not provide an actual
                # bank-account balance.
                #
                # Net cash flow remains the signed value.
                #

                # ============================================================
                # INVOICE SUMMARY
                # ============================================================

                invoice_count = 0
                invoice_value = 0.0
                invoice_paid = 0.0

                if self._table_exists(
                    cursor,
                    "invoices",
                ):
                    cursor.execute(
                        """
                        SELECT
                            COUNT(*) AS total_invoices,

                            COALESCE(
                                SUM(
                                    total_amount
                                ),
                                0
                            ) AS invoice_value,

                            COALESCE(
                                SUM(
                                    amount_paid
                                ),
                                0
                            ) AS invoice_paid

                        FROM invoices
                        """
                    )

                    row = (
                        cursor.fetchone()
                        or {}
                    )

                    invoice_count = (
                        self._safe_int(
                            row.get(
                                "total_invoices"
                            )
                        )
                    )

                    invoice_value = (
                        self._safe_float(
                            row.get(
                                "invoice_value"
                            )
                        )
                    )

                    invoice_paid = (
                        self._safe_float(
                            row.get(
                                "invoice_paid"
                            )
                        )
                    )

                # ============================================================
                # CUSTOMERS
                # ============================================================

                customers = 0

                if self._table_exists(
                    cursor,
                    "customers",
                ):
                    if self._column_exists(
                        cursor,
                        "customers",
                        "status",
                    ):
                        cursor.execute(
                            """
                            SELECT
                                COUNT(*) AS total_customers
                            FROM customers
                            WHERE LOWER(
                                COALESCE(status, '')
                            ) = 'active'
                            """
                        )
                    else:
                        cursor.execute(
                            """
                            SELECT
                                COUNT(*) AS total_customers
                            FROM customers
                            """
                        )

                    row = (
                        cursor.fetchone()
                        or {}
                    )

                    customers = (
                        self._safe_int(
                            row.get(
                                "total_customers"
                            )
                        )
                    )

                # ============================================================
                # SUPPLIERS
                # ============================================================

                suppliers = 0

                if self._table_exists(
                    cursor,
                    "suppliers",
                ):
                    if self._column_exists(
                        cursor,
                        "suppliers",
                        "status",
                    ):
                        cursor.execute(
                            """
                            SELECT
                                COUNT(*) AS total_suppliers
                            FROM suppliers
                            WHERE LOWER(
                                COALESCE(status, '')
                            ) = 'active'
                            """
                        )
                    else:
                        cursor.execute(
                            """
                            SELECT
                                COUNT(*) AS total_suppliers
                            FROM suppliers
                            """
                        )

                    row = (
                        cursor.fetchone()
                        or {}
                    )

                    suppliers = (
                        self._safe_int(
                            row.get(
                                "total_suppliers"
                            )
                        )
                    )

                # ============================================================
                # OVERDUE PERCENTAGE
                # ============================================================

                overdue_percentage = 0.0

                if receivables > 0:
                    overdue_percentage = (
                        overdue
                        / receivables
                    ) * 100

                # ============================================================
                # TRENDS
                # ============================================================

                #
                # Calculate current vs previous 30-day period.
                # These values are based on daily_cash_flow where possible.
                #

                cash_trend = None
                net_trend = None

                if (
                    self._table_exists(
                        cursor,
                        "daily_cash_flow",
                    )
                ):
                    cash_flow_date_column = (
                        self._get_date_column(
                            cursor,
                            "daily_cash_flow",
                        )
                    )

                    if cash_flow_date_column:
                        cursor.execute(
                            f"""
                            SELECT
                                COALESCE(
                                    SUM(
                                        CASE
                                            WHEN `{cash_flow_date_column}`
                                                >= DATE_SUB(
                                                    CURRENT_DATE,
                                                    INTERVAL 30 DAY
                                                )
                                            AND `{cash_flow_date_column}`
                                                <= CURRENT_DATE
                                            THEN cash_inflow
                                                - cash_outflow
                                            ELSE 0
                                        END
                                    ),
                                    0
                                ) AS current_net,

                                COALESCE(
                                    SUM(
                                        CASE
                                            WHEN `{cash_flow_date_column}`
                                                >= DATE_SUB(
                                                    CURRENT_DATE,
                                                    INTERVAL 60 DAY
                                                )
                                            AND `{cash_flow_date_column}`
                                                < DATE_SUB(
                                                    CURRENT_DATE,
                                                    INTERVAL 30 DAY
                                                )
                                            THEN cash_inflow
                                                - cash_outflow
                                            ELSE 0
                                        END
                                    ),
                                    0
                                ) AS previous_net
                            FROM daily_cash_flow
                            """
                        )

                        trend_row = (
                            cursor.fetchone()
                            or {}
                        )

                        current_net = (
                            self._safe_float(
                                trend_row.get(
                                    "current_net"
                                )
                            )
                        )

                        previous_net = (
                            self._safe_float(
                                trend_row.get(
                                    "previous_net"
                                )
                            )
                        )

                        if previous_net != 0:
                            net_trend = (
                                (
                                    (
                                        current_net
                                        - previous_net
                                    )
                                    /
                                    abs(
                                        previous_net
                                    )
                                )
                                * 100
                            )

                        if cash != 0:
                            cash_trend = (
                                net_trend
                            )

                # ============================================================
                # BUSINESS PROFILE
                # ============================================================

                business_name = "Your business"
                business_type = "MSME"

                if self._table_exists(
                    cursor,
                    "businesses",
                ):
                    cursor.execute(
                        """
                        SELECT *
                        FROM businesses
                        ORDER BY 1
                        LIMIT 1
                        """
                    )

                    business_row = (
                        cursor.fetchone()
                        or {}
                    )

                    business_name = (
                        business_row.get(
                            "name"
                        )
                        or business_row.get(
                            "business_name"
                        )
                        or business_row.get(
                            "company_name"
                        )
                        or business_name
                    )

                    business_type = (
                        business_row.get(
                            "business_type"
                        )
                        or business_row.get(
                            "type"
                        )
                        or business_row.get(
                            "industry"
                        )
                        or business_type
                    )

                # ============================================================
                # USER PROFILE
                # ============================================================

                user_name = "Business owner"

                #
                # Authentication can be connected later.
                # We intentionally do not invent a user from database data.
                #

                # ============================================================
                # RESPONSE
                # ============================================================

                return {
                    "status": "success",

                    "summary": {
                        # ----------------------------------------------------
                        # Frontend KPI fields
                        # ----------------------------------------------------

                        "cash": cash,

                        "receivables": receivables,

                        "payables": payables,

                        "netCashFlow": net_cash_flow,

                        "overdue": overdue,

                        "upcoming": upcoming,

                        "businessName": str(
                            business_name
                        ),

                        "businessType": str(
                            business_type
                        ),

                        "userName": str(
                            user_name
                        ),

                        "cashAccountsCount": None,

                        "overduePercentage": (
                            overdue_percentage
                        ),

                        "upcomingCount": (
                            upcoming_count
                        ),

                        "cashTrend": cash_trend,

                        "receivableTrend": None,

                        "payableTrend": None,

                        "netTrend": net_trend,

                        # ----------------------------------------------------
                        # Financial summary
                        # ----------------------------------------------------

                        "revenue": revenue,

                        "expenses": expenses,

                        "collected": collected,

                        "cash_flow": {
                            "inflow": cash_inflow,
                            "outflow": cash_outflow,
                            "net": net_cash_flow,
                        },

                        # ----------------------------------------------------
                        # Invoice summary
                        # ----------------------------------------------------

                        "invoices": {
                            "count": invoice_count,
                            "value": invoice_value,
                            "paid": invoice_paid,
                        },

                        # ----------------------------------------------------
                        # Entity counts
                        # ----------------------------------------------------

                        "customers": customers,

                        "suppliers": suppliers,
                    },
                }

            finally:
                cursor.close()