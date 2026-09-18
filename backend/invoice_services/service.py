from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any

from database import get_database_connection


class InvoiceService:
    """
    Live Invoice Service for CashGuard-AI.

    Responsibilities:
    - Read invoices from MySQL.
    - Normalize invoice data for frontend.
    - Calculate paid/outstanding balances.
    - Read real invoice payments.
    - Create new invoices.
    - Calculate GST/tax for new invoices.
    - Generate invoice numbers safely.
    - Mark invoices as paid.
    """

    # ========================================================================
    # CONSTANTS
    # ========================================================================

    MONEY_QUANT = Decimal("0.01")

    ALLOWED_STATUSES = {
        "draft": "draft",
        "sent": "sent",
        "due": "due",
        "overdue": "overdue",
        "paid": "paid",
        "cancelled": "cancelled",
        "canceled": "cancelled",
    }

    # ========================================================================
    # DATABASE / COLUMN HELPERS
    # ========================================================================

    def _get_columns(
        self,
        cursor,
        table_name: str,
    ) -> list[str]:
        cursor.execute(
            """
            SELECT COLUMN_NAME
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = %s
            ORDER BY ORDINAL_POSITION
            """,
            (table_name,),
        )

        rows = cursor.fetchall() or []

        return [
            str(row["COLUMN_NAME"])
            for row in rows
            if row.get("COLUMN_NAME") is not None
        ]

    def _pick(
        self,
        columns: list[str],
        *names: str,
    ) -> str | None:
        lookup = {
            column.lower(): column
            for column in columns
        }

        for name in names:
            match = lookup.get(
                name.lower()
            )

            if match:
                return match

        return None

    # ========================================================================
    # VALUE HELPERS
    # ========================================================================

    def _decimal(
        self,
        value: Any,
    ) -> Decimal:
        if value is None:
            return Decimal("0.00")

        if isinstance(
            value,
            Decimal,
        ):
            return value

        try:
            return Decimal(
                str(value)
            )
        except (
            InvalidOperation,
            TypeError,
            ValueError,
        ):
            return Decimal("0.00")

    def _money(
        self,
        value: Any,
    ) -> Decimal:
        return self._decimal(
            value
        ).quantize(
            self.MONEY_QUANT,
            rounding=ROUND_HALF_UP,
        )

    def _number(
        self,
        value: Any,
    ) -> float:
        return float(
            self._money(value)
        )

    def _positive_money(
        self,
        value: Any,
    ) -> Decimal:
        return max(
            self._money(value),
            Decimal("0.00"),
        )

    def _positive_number(
        self,
        value: Any,
    ) -> float:
        return float(
            self._positive_money(value)
        )

    def _string(
        self,
        value: Any,
        fallback: str = "",
    ) -> str:
        if value is None:
            return fallback

        text = str(value).strip()

        return (
            text
            if text
            else fallback
        )

    def _format_date(
        self,
        value: Any,
    ) -> str:
        if value is None:
            return ""

        if isinstance(
            value,
            datetime,
        ):
            return value.strftime(
                "%d %b %Y"
            )

        if isinstance(
            value,
            date,
        ):
            return value.strftime(
                "%d %b %Y"
            )

        return str(value)

    def _iso_date(
        self,
        value: Any,
    ) -> str | None:
        if value is None:
            return None

        if isinstance(
            value,
            datetime,
        ):
            return value.date().isoformat()

        if isinstance(
            value,
            date,
        ):
            return value.isoformat()

        text = str(value).strip()

        if not text:
            return None

        return text

    def _parse_date(
        self,
        value: Any,
        fallback: date | None = None,
    ) -> date | None:
        if value is None:
            return fallback

        if isinstance(
            value,
            datetime,
        ):
            return value.date()

        if isinstance(
            value,
            date,
        ):
            return value

        text = str(value).strip()

        if not text:
            return fallback

        # YYYY-MM-DD
        try:
            return date.fromisoformat(
                text[:10]
            )
        except ValueError:
            pass

        # DD Mon YYYY
        for fmt in (
            "%d %b %Y",
            "%d-%m-%Y",
            "%d/%m/%Y",
            "%Y/%m/%d",
        ):
            try:
                return datetime.strptime(
                    text,
                    fmt,
                ).date()
            except ValueError:
                continue

        return fallback

    # ========================================================================
    # CUSTOMER HELPERS
    # ========================================================================

    def _customer_names(
        self,
        cursor,
    ) -> dict[str, str]:
        columns = self._get_columns(
            cursor,
            "customers",
        )

        if not columns:
            return {}

        id_column = self._pick(
            columns,
            "customer_id",
            "id",
        )

        name_column = self._pick(
            columns,
            "name",
            "customer_name",
            "company_name",
            "business_name",
            "full_name",
        )

        if not id_column or not name_column:
            return {}

        cursor.execute(
            f"""
            SELECT
                `{id_column}` AS customer_id,
                `{name_column}` AS customer_name
            FROM customers
            """
        )

        rows = cursor.fetchall() or []

        result: dict[str, str] = {}

        for row in rows:
            customer_id = row.get(
                "customer_id"
            )

            if customer_id is None:
                continue

            result[
                str(customer_id)
            ] = self._string(
                row.get(
                    "customer_name"
                ),
                "Unknown Customer",
            )

        return result

    def _customer_exists(
        self,
        cursor,
        customer_id: str,
    ) -> bool:
        columns = self._get_columns(
            cursor,
            "customers",
        )

        if not columns:
            return False

        id_column = self._pick(
            columns,
            "customer_id",
            "id",
        )

        if not id_column:
            return False

        cursor.execute(
            f"""
            SELECT 1
            FROM customers
            WHERE CAST(`{id_column}` AS CHAR) = %s
            LIMIT 1
            """,
            (str(customer_id),),
        )

        return (
            cursor.fetchone()
            is not None
        )

    # ========================================================================
    # INVOICE COLUMN RESOLUTION
    # ========================================================================

    def _invoice_mapping(
        self,
        columns: list[str],
    ) -> dict[str, str | None]:
        return {
            "id": self._pick(
                columns,
                "invoice_id",
                "id",
                "invoice_number",
                "number",
            ),

            "number": self._pick(
                columns,
                "invoice_number",
                "number",
                "invoice_no",
            ),

            "business_id": self._pick(
                columns,
                "business_id",
                "business",
            ),

            "customer_id": self._pick(
                columns,
                "customer_id",
                "client_id",
                "customer_ref",
            ),

            "sale_id": self._pick(
                columns,
                "sale_id",
                "sales_id",
            ),

            "customer_name": self._pick(
                columns,
                "customer_name",
                "client_name",
            ),

            "total": self._pick(
                columns,
                "total_amount",
                "grand_total",
                "invoice_total",
                "total",
                "amount",
            ),

            "subtotal": self._pick(
                columns,
                "subtotal",
                "sub_total",
                "taxable_amount",
                "taxable_value",
                "base_amount",
            ),

            "paid": self._pick(
                columns,
                "amount_paid",
                "paid_amount",
                "collected_amount",
                "paid",
                "payment_received",
            ),

            "status": self._pick(
                columns,
                "status",
                "invoice_status",
            ),

            "issue_date": self._pick(
                columns,
                "issue_date",
                "invoice_date",
                "issued_at",
                "created_at",
                "date",
            ),

            "due_date": self._pick(
                columns,
                "due_date",
                "payment_due_date",
                "due_at",
            ),

            "description": self._pick(
                columns,
                "description",
                "item_description",
                "service_description",
                "remarks",
            ),

            "reference": self._pick(
                columns,
                "reference",
                "reference_no",
                "invoice_reference",
                "po_number",
                "purchase_order",
                "purchase_order_number",
            ),

            "notes": self._pick(
                columns,
                "notes",
                "remarks",
                "comment",
                "comments",
            ),

            "currency": self._pick(
                columns,
                "currency",
                "currency_code",
            ),

            "taxable_amount": self._pick(
                columns,
                "taxable_amount",
                "taxable_value",
                "taxable_subtotal",
            ),

            "tax_amount": self._pick(
                columns,
                "tax_amount",
                "total_tax",
                "gst_amount",
                "tax",
            ),

            "cgst": self._pick(
                columns,
                "cgst",
                "cgst_amount",
            ),

            "sgst": self._pick(
                columns,
                "sgst",
                "sgst_amount",
            ),

            "igst": self._pick(
                columns,
                "igst",
                "igst_amount",
            ),

            "gst_rate": self._pick(
                columns,
                "gst_rate",
                "tax_rate",
                "gst_percentage",
                "tax_percentage",
            ),

            "created_at": self._pick(
                columns,
                "created_at",
            ),

            "updated_at": self._pick(
                columns,
                "updated_at",
            ),
        }

    # ========================================================================
    # STATUS
    # ========================================================================

    def _normalize_status(
        self,
        raw_status: Any,
        outstanding: float,
        due_value: Any,
    ) -> str:
        raw = self._string(
            raw_status
        ).lower()

        status_map = {
            "draft": "Draft",
            "sent": "Sent",
            "issued": "Sent",
            "due": "Due",
            "pending": "Due",
            "open": "Due",
            "outstanding": "Due",
            "overdue": "Overdue",
            "paid": "Paid",
            "cancelled": "Cancelled",
            "canceled": "Cancelled",
        }

        if raw in status_map:
            normalized = status_map[
                raw
            ]

            if (
                outstanding <= 0
                and normalized
                not in {
                    "Draft",
                    "Cancelled",
                }
            ):
                return "Paid"

            return normalized

        if outstanding <= 0:
            return "Paid"

        due_date = self._parse_date(
            due_value
        )

        if (
            due_date is not None
            and due_date < date.today()
        ):
            return "Overdue"

        return "Due"

    # ========================================================================
    # GST / TAX
    # ========================================================================

    def _extract_tax_values(
        self,
        row: dict[str, Any],
        mapping: dict[str, str | None],
        total: float,
    ) -> dict[str, float]:
        taxable_column = mapping[
            "taxable_amount"
        ]

        tax_column = mapping[
            "tax_amount"
        ]

        cgst_column = mapping[
            "cgst"
        ]

        sgst_column = mapping[
            "sgst"
        ]

        igst_column = mapping[
            "igst"
        ]

        subtotal_column = mapping[
            "subtotal"
        ]

        taxable = Decimal(
            "0.00"
        )

        if taxable_column:
            taxable = (
                self._positive_money(
                    row.get(
                        taxable_column
                    )
                )
            )

        if (
            taxable <= 0
            and subtotal_column
        ):
            taxable = (
                self._positive_money(
                    row.get(
                        subtotal_column
                    )
                )
            )

        cgst = (
            self._positive_money(
                row.get(
                    cgst_column
                )
            )
            if cgst_column
            else Decimal("0.00")
        )

        sgst = (
            self._positive_money(
                row.get(
                    sgst_column
                )
            )
            if sgst_column
            else Decimal("0.00")
        )

        igst = (
            self._positive_money(
                row.get(
                    igst_column
                )
            )
            if igst_column
            else Decimal("0.00")
        )

        explicit_tax = (
            self._positive_money(
                row.get(
                    tax_column
                )
            )
            if tax_column
            else Decimal("0.00")
        )

        split_tax = (
            cgst
            + sgst
            + igst
        )

        tax_amount = (
            split_tax
            if split_tax > 0
            else explicit_tax
        )

        if (
            tax_amount <= 0
            and taxable > 0
            and self._money(total)
            > taxable
        ):
            tax_amount = (
                self._money(total)
                - taxable
            )

        return {
            "taxable_amount": float(
                taxable
            ),
            "tax_amount": float(
                tax_amount
            ),
            "cgst": float(
                cgst
            ),
            "sgst": float(
                sgst
            ),
            "igst": float(
                igst
            ),
        }

    def calculate_gst(
        self,
        subtotal: Any,
        gst_rate: Any = 5,
        gst_type: str = "CGST_SGST",
    ) -> dict[str, float]:
        """
        Calculate GST for a new invoice.

        Default:
            5% GST = 2.5% CGST + 2.5% SGST

        For IGST:
            full GST amount goes to IGST.

        This method is used only when explicitly creating
        a new invoice. Existing invoice tax values are never
        overwritten during normal GET/list operations.
        """

        base = self._positive_money(
            subtotal
        )

        rate = self._positive_money(
            gst_rate
        )

        if rate > Decimal("100.00"):
            raise ValueError(
                "GST rate cannot exceed 100%."
            )

        tax_amount = (
            base
            * rate
            / Decimal("100.00")
        ).quantize(
            self.MONEY_QUANT,
            rounding=ROUND_HALF_UP,
        )

        normalized_type = (
            self._string(
                gst_type,
                "CGST_SGST",
            )
            .upper()
            .replace(
                "-",
                "_",
            )
        )

        cgst = Decimal(
            "0.00"
        )

        sgst = Decimal(
            "0.00"
        )

        igst = Decimal(
            "0.00"
        )

        if normalized_type == "IGST":
            igst = tax_amount

        else:
            cgst = (
                tax_amount
                / Decimal("2.00")
            ).quantize(
                self.MONEY_QUANT,
                rounding=ROUND_HALF_UP,
            )

            sgst = (
                tax_amount
                - cgst
            ).quantize(
                self.MONEY_QUANT,
                rounding=ROUND_HALF_UP,
            )

        total = (
            base
            + tax_amount
        ).quantize(
            self.MONEY_QUANT,
            rounding=ROUND_HALF_UP,
        )

        return {
            "subtotal": float(
                base
            ),
            "gst_rate": float(
                rate
            ),
            "tax_amount": float(
                tax_amount
            ),
            "cgst": float(
                cgst
            ),
            "sgst": float(
                sgst
            ),
            "igst": float(
                igst
            ),
            "total_amount": float(
                total
            ),
        }

    # ========================================================================
    # NORMALIZE INVOICE
    # ========================================================================

    def _normalize(
        self,
        row: dict[str, Any],
        columns: list[str],
        customer_names: dict[str, str],
    ) -> dict[str, Any]:

        mapping = self._invoice_mapping(
            columns
        )

        id_column = mapping["id"]

        customer_id_column = (
            mapping["customer_id"]
        )

        customer_name_column = (
            mapping["customer_name"]
        )

        total_column = mapping[
            "total"
        ]

        paid_column = mapping[
            "paid"
        ]

        status_column = mapping[
            "status"
        ]

        issue_column = mapping[
            "issue_date"
        ]

        due_column = mapping[
            "due_date"
        ]

        description_column = mapping[
            "description"
        ]

        reference_column = mapping[
            "reference"
        ]

        notes_column = mapping[
            "notes"
        ]

        invoice_id = (
            row.get(id_column)
            if id_column
            else None
        )

        total = (
            self._positive_number(
                row.get(
                    total_column
                )
            )
            if total_column
            else 0.0
        )

        paid = (
            self._positive_number(
                row.get(
                    paid_column
                )
            )
            if paid_column
            else 0.0
        )

        if total > 0:
            paid = min(
                paid,
                total,
            )

        outstanding = max(
            total - paid,
            0.0,
        )

        # --------------------------------------------------------------
        # CUSTOMER
        # --------------------------------------------------------------

        customer_id = None

        if customer_id_column:
            raw_customer_id = row.get(
                customer_id_column
            )

            if raw_customer_id is not None:
                customer_id = str(
                    raw_customer_id
                )

        customer_name = ""

        if customer_name_column:
            customer_name = self._string(
                row.get(
                    customer_name_column
                )
            )

        if (
            not customer_name
            and customer_id is not None
        ):
            customer_name = (
                customer_names.get(
                    customer_id,
                    "",
                )
            )

        if not customer_name:
            customer_name = (
                "Unknown Customer"
            )

        # --------------------------------------------------------------
        # STATUS
        # --------------------------------------------------------------

        raw_status = (
            row.get(
                status_column
            )
            if status_column
            else None
        )

        status = (
            self._normalize_status(
                raw_status=raw_status,
                outstanding=outstanding,
                due_value=(
                    row.get(
                        due_column
                    )
                    if due_column
                    else None
                ),
            )
        )

        # --------------------------------------------------------------
        # TAX
        # --------------------------------------------------------------

        tax = (
            self._extract_tax_values(
                row=row,
                mapping=mapping,
                total=total,
            )
        )

        subtotal_column = (
            mapping["subtotal"]
        )

        subtotal = (
            self._positive_number(
                row.get(
                    subtotal_column
                )
            )
            if subtotal_column
            else tax[
                "taxable_amount"
            ]
        )

        return {
            "id": self._string(
                invoice_id
            ),

            "invoice_number": (
                self._string(
                    row.get(
                        mapping["number"]
                    )
                )
                if mapping["number"]
                else ""
            ),

            "business_id": self._string(
                row.get(
                    mapping["business_id"]
                )
                if mapping["business_id"]
                else ""
            ),

            "customer": customer_name,

            "customer_id": customer_id,

            "sale_id": (
                self._string(
                    row.get(
                        mapping["sale_id"]
                    )
                )
                if mapping["sale_id"]
                else None
            ),

            "description": (
                self._string(
                    row.get(
                        description_column
                    ),
                    "Invoice",
                )
                if description_column
                else "Invoice"
            ),

            "issue": self._format_date(
                row.get(
                    issue_column
                )
                if issue_column
                else None
            ),

            "issue_date": self._iso_date(
                row.get(
                    issue_column
                )
                if issue_column
                else None
            ),

            "due": self._format_date(
                row.get(
                    due_column
                )
                if due_column
                else None
            ),

            "due_date": self._iso_date(
                row.get(
                    due_column
                )
                if due_column
                else None
            ),

            "amount": round(
                total,
                2,
            ),

            "subtotal": round(
                subtotal,
                2,
            ),

            "total_amount": round(
                total,
                2,
            ),

            "paid": round(
                paid,
                2,
            ),

            "amount_paid": round(
                paid,
                2,
            ),

            "outstanding": round(
                outstanding,
                2,
            ),

            "status": status,

            "reference": (
                self._string(
                    row.get(
                        reference_column
                    )
                )
                if reference_column
                else ""
            ),

            "notes": (
                self._string(
                    row.get(
                        notes_column
                    )
                )
                if notes_column
                else ""
            ),

            "currency": (
                self._string(
                    row.get(
                        mapping["currency"]
                    ),
                    "INR",
                )
                if mapping["currency"]
                else "INR"
            ),

            "taxable_amount": tax[
                "taxable_amount"
            ],

            "tax_amount": tax[
                "tax_amount"
            ],

            "cgst": tax[
                "cgst"
            ],

            "sgst": tax[
                "sgst"
            ],

            "igst": tax[
                "igst"
            ],

            "gst_rate": (
                self._number(
                    row.get(
                        mapping["gst_rate"]
                    )
                )
                if mapping["gst_rate"]
                else (
                    (
                        tax[
                            "tax_amount"
                        ]
                        / tax[
                            "taxable_amount"
                        ]
                        * 100
                    )
                    if tax[
                        "taxable_amount"
                    ]
                    > 0
                    else 0.0
                )
            ),

            "created_at": (
                self._iso_date(
                    row.get(
                        mapping["created_at"]
                    )
                )
                if mapping["created_at"]
                else None
            ),

            "updated_at": (
                self._iso_date(
                    row.get(
                        mapping["updated_at"]
                    )
                )
                if mapping["updated_at"]
                else None
            ),
        }

    # ========================================================================
    # INVOICE NUMBER GENERATION
    # ========================================================================

    def _generate_invoice_number(
        self,
        cursor,
        columns: list[str],
    ) -> str:
        number_column = self._pick(
            columns,
            "invoice_number",
            "number",
            "invoice_no",
        )

        if not number_column:
            raise RuntimeError(
                "Invoice number column was not found."
            )

        year = date.today().year

        prefix = (
            f"INV-{year}-"
        )

        cursor.execute(
            f"""
            SELECT `{number_column}` AS invoice_number
            FROM invoices
            WHERE `{number_column}` LIKE %s
            ORDER BY `{number_column}` DESC
            LIMIT 1
            """,
            (
                f"{prefix}%",
            ),
        )

        row = cursor.fetchone()

        next_number = 1

        if row:
            previous = self._string(
                row.get(
                    "invoice_number"
                )
            )

            try:
                suffix = previous[
                    len(prefix):
                ]

                next_number = (
                    int(suffix)
                    + 1
                )

            except (
                ValueError,
                TypeError,
            ):
                next_number = 1

        return (
            f"{prefix}"
            f"{next_number:05d}"
        )

    # ========================================================================
    # CREATE INVOICE
    # ========================================================================

    def create_invoice(
        self,
        business_id: str,
        customer_id: str,
        subtotal: Any,
        gst_rate: Any = 5,
        gst_type: str = "CGST_SGST",
        due_date: Any = None,
        invoice_date: Any = None,
        description: str = "Invoice",
        reference: str = "",
        notes: str = "",
        sale_id: str | None = None,
        status: str = "draft",
    ) -> dict[str, Any]:
        """
        Create a real invoice in MySQL.

        The method intentionally uses the existing invoices table
        dynamically, so it only inserts columns that actually exist.

        Required:
            business_id
            customer_id
            subtotal

        GST:
            gst_rate
            gst_type = CGST_SGST / IGST

        The invoice starts with amount_paid = 0.
        """

        normalized_business_id = (
            self._string(
                business_id
            )
        )

        normalized_customer_id = (
            self._string(
                customer_id
            )
        )

        if not normalized_business_id:
            raise ValueError(
                "business_id is required."
            )

        if not normalized_customer_id:
            raise ValueError(
                "customer_id is required."
            )

        base_amount = self._positive_money(
            subtotal
        )

        if base_amount <= 0:
            raise ValueError(
                "subtotal must be greater than 0."
            )

        normalized_status = (
            self.ALLOWED_STATUSES.get(
                self._string(
                    status,
                    "draft",
                ).lower(),
                "draft",
            )
        )

        issue = self._parse_date(
            invoice_date,
            fallback=date.today(),
        )

        due = self._parse_date(
            due_date,
            fallback=(
                issue
                + timedelta(days=30)
                if issue
                else date.today()
                + timedelta(days=30)
            ),
        )

        if issue is None:
            issue = date.today()

        if due is None:
            due = (
                issue
                + timedelta(days=30)
            )

        if due < issue:
            raise ValueError(
                "due_date cannot be before invoice_date."
            )

        gst = self.calculate_gst(
            subtotal=base_amount,
            gst_rate=gst_rate,
            gst_type=gst_type,
        )

        total_amount = self._money(
            gst[
                "total_amount"
            ]
        )

        invoice_id = (
            __import__(
                "uuid"
            ).uuid4()
        )

        with get_database_connection() as connection:
            cursor = connection.cursor(
                dictionary=True
            )

            try:
                columns = self._get_columns(
                    cursor,
                    "invoices",
                )

                if not columns:
                    raise RuntimeError(
                        "invoices table was not found."
                    )

                mapping = (
                    self._invoice_mapping(
                        columns
                    )
                )

                # ------------------------------------------------------
                # Validate customer.
                # ------------------------------------------------------

                if not self._customer_exists(
                    cursor,
                    normalized_customer_id,
                ):
                    raise ValueError(
                        "Customer not found."
                    )

                invoice_number = (
                    self._generate_invoice_number(
                        cursor,
                        columns,
                    )
                )

                # ------------------------------------------------------
                # Build INSERT dynamically.
                # ------------------------------------------------------

                values_by_column: dict[
                    str,
                    Any,
                ] = {}

                if mapping["id"]:
                    values_by_column[
                        mapping["id"]
                    ] = str(
                        invoice_id
                    )

                if mapping[
                    "business_id"
                ]:
                    values_by_column[
                        mapping[
                            "business_id"
                        ]
                    ] = (
                        normalized_business_id
                    )

                if mapping[
                    "customer_id"
                ]:
                    values_by_column[
                        mapping[
                            "customer_id"
                        ]
                    ] = (
                        normalized_customer_id
                    )

                if mapping["sale_id"]:
                    values_by_column[
                        mapping["sale_id"]
                    ] = (
                        sale_id
                        if sale_id
                        else None
                    )

                if mapping[
                    "number"
                ]:
                    values_by_column[
                        mapping["number"]
                    ] = invoice_number

                if mapping[
                    "issue_date"
                ]:
                    values_by_column[
                        mapping["issue_date"]
                    ] = issue

                if mapping[
                    "due_date"
                ]:
                    values_by_column[
                        mapping["due_date"]
                    ] = due

                if mapping[
                    "status"
                ]:
                    values_by_column[
                        mapping["status"]
                    ] = normalized_status

                if mapping[
                    "subtotal"
                ]:
                    values_by_column[
                        mapping["subtotal"]
                    ] = float(
                        gst[
                            "subtotal"
                        ]
                    )

                if mapping[
                    "taxable_amount"
                ]:
                    values_by_column[
                        mapping[
                            "taxable_amount"
                        ]
                    ] = float(
                        gst[
                            "subtotal"
                        ]
                    )

                if mapping[
                    "tax_amount"
                ]:
                    values_by_column[
                        mapping[
                            "tax_amount"
                        ]
                    ] = float(
                        gst[
                            "tax_amount"
                        ]
                    )

                if mapping[
                    "cgst"
                ]:
                    values_by_column[
                        mapping["cgst"]
                    ] = float(
                        gst["cgst"]
                    )

                if mapping[
                    "sgst"
                ]:
                    values_by_column[
                        mapping["sgst"]
                    ] = float(
                        gst["sgst"]
                    )

                if mapping[
                    "igst"
                ]:
                    values_by_column[
                        mapping["igst"]
                    ] = float(
                        gst["igst"]
                    )

                if mapping[
                    "gst_rate"
                ]:
                    values_by_column[
                        mapping[
                            "gst_rate"
                        ]
                    ] = float(
                        gst["gst_rate"]
                    )

                if mapping[
                    "total"
                ]:
                    values_by_column[
                        mapping["total"]
                    ] = float(
                        total_amount
                    )

                if mapping[
                    "paid"
                ]:
                    values_by_column[
                        mapping["paid"]
                    ] = 0.0

                if mapping[
                    "description"
                ]:
                    values_by_column[
                        mapping[
                            "description"
                        ]
                    ] = self._string(
                        description,
                        "Invoice",
                    )

                if mapping[
                    "reference"
                ]:
                    values_by_column[
                        mapping[
                            "reference"
                        ]
                    ] = self._string(
                        reference
                    )

                if mapping[
                    "notes"
                ]:
                    values_by_column[
                        mapping[
                            "notes"
                        ]
                    ] = self._string(
                        notes
                    )

                if mapping[
                    "currency"
                ]:
                    values_by_column[
                        mapping[
                            "currency"
                        ]
                    ] = "INR"

                # ------------------------------------------------------
                # Remove columns that cannot accept NULL when needed.
                # sale_id is left out if caller did not provide it.
                # ------------------------------------------------------

                if (
                    mapping["sale_id"]
                    and not sale_id
                ):
                    values_by_column.pop(
                        mapping["sale_id"],
                        None,
                    )

                if (
                    mapping["customer_name"]
                    and mapping[
                        "customer_name"
                    ]
                    not in values_by_column
                ):
                    # Customer name is generally derived from
                    # customer_id and may not be needed by the schema.
                    pass

                if mapping[
                    "created_at"
                ]:
                    values_by_column[
                        mapping["created_at"]
                    ] = datetime.now()

                if mapping[
                    "updated_at"
                ]:
                    values_by_column[
                        mapping["updated_at"]
                    ] = datetime.now()

                if not values_by_column:
                    raise RuntimeError(
                        "No writable invoice columns were found."
                    )

                insert_columns = list(
                    values_by_column.keys()
                )

                placeholders = ", ".join(
                    ["%s"] * len(
                        insert_columns
                    )
                )

                escaped_columns = ", ".join(
                    f"`{column}`"
                    for column in insert_columns
                )

                insert_values = tuple(
                    values_by_column[
                        column
                    ]
                    for column in insert_columns
                )

                cursor.execute(
                    f"""
                    INSERT INTO invoices (
                        {escaped_columns}
                    )
                    VALUES (
                        {placeholders}
                    )
                    """,
                    insert_values,
                )

                connection.commit()

                # ------------------------------------------------------
                # Fetch the invoice after insertion so response has
                # exactly the same normalization as GET.
                # ------------------------------------------------------

                created_invoice = (
                    self.get_invoice(
                        str(
                            invoice_id
                        )
                    )
                )

                if created_invoice is None:
                    raise RuntimeError(
                        "Invoice was created but could not be loaded afterward."
                    )

                return {
                    "status": "success",
                    "message": (
                        "Invoice created successfully."
                    ),
                    "invoice": created_invoice,
                    "calculation": {
                        "subtotal": gst[
                            "subtotal"
                        ],
                        "gst_rate": gst[
                            "gst_rate"
                        ],
                        "gst_type": (
                            gst_type.upper()
                        ),
                        "tax_amount": gst[
                            "tax_amount"
                        ],
                        "cgst": gst[
                            "cgst"
                        ],
                        "sgst": gst[
                            "sgst"
                        ],
                        "igst": gst[
                            "igst"
                        ],
                        "total_amount": gst[
                            "total_amount"
                        ],
                        "amount_paid": 0.0,
                        "outstanding": gst[
                            "total_amount"
                        ],
                    },
                }

            except Exception:
                connection.rollback()
                raise

            finally:
                cursor.close()

    # ========================================================================
    # LIST INVOICES
    # ========================================================================

    def list_invoices(
        self,
        search: str = "",
        status: str = "All",
        page: int = 1,
        page_size: int = 20,
    ) -> dict[str, Any]:

        page = max(
            int(page),
            1,
        )

        page_size = min(
            max(
                int(page_size),
                1,
            ),
            500,
        )

        normalized_status = (
            status.strip()
            if status
            else "All"
        )

        normalized_search = (
            search.strip().lower()
            if search
            else ""
        )

        with get_database_connection() as connection:
            cursor = connection.cursor(
                dictionary=True
            )

            try:
                columns = self._get_columns(
                    cursor,
                    "invoices",
                )

                if not columns:
                    raise RuntimeError(
                        "invoices table was not found."
                    )

                customer_names = (
                    self._customer_names(
                        cursor
                    )
                )

                cursor.execute(
                    """
                    SELECT *
                    FROM invoices
                    """
                )

                rows = (
                    cursor.fetchall()
                    or []
                )

                invoices = [
                    self._normalize(
                        row=row,
                        columns=columns,
                        customer_names=customer_names,
                    )
                    for row in rows
                ]

                if normalized_search:
                    invoices = [
                        invoice
                        for invoice in invoices
                        if normalized_search
                        in " ".join(
                            [
                                self._string(
                                    invoice.get(
                                        "id"
                                    )
                                ),
                                self._string(
                                    invoice.get(
                                        "invoice_number"
                                    )
                                ),
                                self._string(
                                    invoice.get(
                                        "customer"
                                    )
                                ),
                                self._string(
                                    invoice.get(
                                        "description"
                                    )
                                ),
                                self._string(
                                    invoice.get(
                                        "reference"
                                    )
                                ),
                                self._string(
                                    invoice.get(
                                        "customer_id"
                                    )
                                ),
                            ]
                        ).lower()
                    ]

                if (
                    normalized_status
                    and normalized_status.lower()
                    != "all"
                ):
                    target_status = (
                        normalized_status.lower()
                    )

                    invoices = [
                        invoice
                        for invoice in invoices
                        if self._string(
                            invoice.get(
                                "status"
                            )
                        ).lower()
                        == target_status
                    ]

                invoices.sort(
                    key=lambda invoice: (
                        self._string(
                            invoice.get(
                                "issue_date"
                            )
                        )
                        or self._string(
                            invoice.get(
                                "id"
                            )
                        )
                    ),
                    reverse=True,
                )

                total_count = len(
                    invoices
                )

                total_value = sum(
                    self._number(
                        invoice.get(
                            "amount"
                        )
                    )
                    for invoice in invoices
                )

                total_paid = sum(
                    self._number(
                        invoice.get(
                            "paid"
                        )
                    )
                    for invoice in invoices
                )

                total_outstanding = sum(
                    self._number(
                        invoice.get(
                            "outstanding"
                        )
                    )
                    for invoice in invoices
                )

                overdue_value = sum(
                    self._number(
                        invoice.get(
                            "outstanding"
                        )
                    )
                    for invoice in invoices
                    if invoice.get(
                        "status"
                    )
                    == "Overdue"
                )

                paid_value = sum(
                    self._number(
                        invoice.get(
                            "amount"
                        )
                    )
                    for invoice in invoices
                    if invoice.get(
                        "status"
                    )
                    == "Paid"
                )

                draft_count = sum(
                    1
                    for invoice in invoices
                    if invoice.get(
                        "status"
                    )
                    == "Draft"
                )

                sent_count = sum(
                    1
                    for invoice in invoices
                    if invoice.get(
                        "status"
                    )
                    == "Sent"
                )

                due_count = sum(
                    1
                    for invoice in invoices
                    if invoice.get(
                        "status"
                    )
                    == "Due"
                )

                overdue_count = sum(
                    1
                    for invoice in invoices
                    if invoice.get(
                        "status"
                    )
                    == "Overdue"
                )

                cancelled_count = sum(
                    1
                    for invoice in invoices
                    if invoice.get(
                        "status"
                    )
                    == "Cancelled"
                )

                total_pages = max(
                    (
                        total_count
                        + page_size
                        - 1
                    )
                    // page_size,
                    1,
                )

                safe_page = min(
                    page,
                    total_pages,
                )

                start = (
                    safe_page - 1
                ) * page_size

                end = (
                    start
                    + page_size
                )

                data = invoices[
                    start:end
                ]

                return {
                    "status": "success",
                    "data": data,
                    "pagination": {
                        "page": safe_page,
                        "page_size": page_size,
                        "total": total_count,
                        "total_pages": total_pages,
                    },
                    "summary": {
                        "total_invoices": total_count,
                        "total_value": round(
                            total_value,
                            2,
                        ),
                        "total_paid": round(
                            total_paid,
                            2,
                        ),
                        "total_outstanding": round(
                            total_outstanding,
                            2,
                        ),
                        "overdue_value": round(
                            overdue_value,
                            2,
                        ),
                        "paid_value": round(
                            paid_value,
                            2,
                        ),
                        "draft_count": draft_count,
                        "sent_count": sent_count,
                        "due_count": due_count,
                        "overdue_count": overdue_count,
                        "cancelled_count": cancelled_count,
                    },
                }

            finally:
                cursor.close()

    # ========================================================================
    # GET SINGLE INVOICE
    # ========================================================================

    def get_invoice(
        self,
        invoice_id: str,
    ) -> dict[str, Any] | None:

        normalized_id = (
            invoice_id.strip()
            if invoice_id
            else ""
        )

        if not normalized_id:
            return None

        with get_database_connection() as connection:
            cursor = connection.cursor(
                dictionary=True
            )

            try:
                columns = self._get_columns(
                    cursor,
                    "invoices",
                )

                if not columns:
                    raise RuntimeError(
                        "invoices table was not found."
                    )

                mapping = (
                    self._invoice_mapping(
                        columns
                    )
                )

                id_column = mapping[
                    "id"
                ]

                if not id_column:
                    raise RuntimeError(
                        "Invoice ID column was not found."
                    )

                customer_names = (
                    self._customer_names(
                        cursor
                    )
                )

                cursor.execute(
                    f"""
                    SELECT *
                    FROM invoices
                    WHERE CAST(`{id_column}` AS CHAR) = %s
                    LIMIT 1
                    """,
                    (
                        normalized_id,
                    ),
                )

                row = cursor.fetchone()

                if not row:
                    return None

                invoice = self._normalize(
                    row=row,
                    columns=columns,
                    customer_names=customer_names,
                )

                payments = (
                    self.get_payments(
                        normalized_id
                    )
                )

                total_payment_history = sum(
                    self._number(
                        payment.get(
                            "amount"
                        )
                    )
                    for payment in payments
                )

                invoice[
                    "payments"
                ] = payments

                invoice[
                    "payment_count"
                ] = len(
                    payments
                )

                invoice[
                    "payment_history_total"
                ] = round(
                    total_payment_history,
                    2,
                )

                return invoice

            finally:
                cursor.close()

    # ========================================================================
    # PAYMENT HISTORY
    # ========================================================================

    def get_payments(
        self,
        invoice_id: str,
    ) -> list[dict[str, Any]]:

        normalized_id = (
            invoice_id.strip()
            if invoice_id
            else ""
        )

        if not normalized_id:
            return []

        with get_database_connection() as connection:
            cursor = connection.cursor(
                dictionary=True
            )

            try:
                columns = self._get_columns(
                    cursor,
                    "invoice_payments",
                )

                if not columns:
                    return []

                invoice_column = self._pick(
                    columns,
                    "invoice_id",
                    "invoice_ref",
                )

                if not invoice_column:
                    return []

                amount_column = self._pick(
                    columns,
                    "amount",
                    "payment_amount",
                    "paid_amount",
                )

                date_column = self._pick(
                    columns,
                    "payment_date",
                    "paid_at",
                    "created_at",
                    "date",
                )

                method_column = self._pick(
                    columns,
                    "payment_method",
                    "method",
                    "mode",
                    "payment_mode",
                )

                reference_column = self._pick(
                    columns,
                    "reference",
                    "reference_no",
                    "transaction_reference",
                    "reference_number",
                )

                transaction_column = self._pick(
                    columns,
                    "transaction_id",
                    "transaction_reference",
                    "bank_transaction_id",
                )

                status_column = self._pick(
                    columns,
                    "status",
                    "payment_status",
                )

                if date_column:
                    order_sql = (
                        f"`{date_column}` DESC"
                    )
                else:
                    order_sql = (
                        f"`{invoice_column}` DESC"
                    )

                cursor.execute(
                    f"""
                    SELECT *
                    FROM invoice_payments
                    WHERE CAST(`{invoice_column}` AS CHAR) = %s
                    ORDER BY {order_sql}
                    """,
                    (
                        normalized_id,
                    ),
                )

                rows = (
                    cursor.fetchall()
                    or []
                )

                result: list[
                    dict[str, Any]
                ] = []

                for row in rows:
                    result.append(
                        {
                            "id": self._string(
                                row.get(
                                    "id"
                                )
                            ),

                            "amount": round(
                                self._positive_number(
                                    row.get(
                                        amount_column
                                    )
                                    if amount_column
                                    else 0
                                ),
                                2,
                            ),

                            "date": self._format_date(
                                row.get(
                                    date_column
                                )
                                if date_column
                                else None
                            ),

                            "payment_date": (
                                self._iso_date(
                                    row.get(
                                        date_column
                                    )
                                )
                                if date_column
                                else None
                            ),

                            "method": (
                                self._string(
                                    row.get(
                                        method_column
                                    ),
                                    "Payment",
                                )
                                if method_column
                                else "Payment"
                            ),

                            "reference": (
                                self._string(
                                    row.get(
                                        reference_column
                                    )
                                )
                                if reference_column
                                else ""
                            ),

                            "transaction_id": (
                                self._string(
                                    row.get(
                                        transaction_column
                                    )
                                )
                                if transaction_column
                                else ""
                            ),

                            "status": (
                                self._string(
                                    row.get(
                                        status_column
                                    ),
                                    "Completed",
                                )
                                if status_column
                                else "Completed"
                            ),
                        }
                    )

                return result

            finally:
                cursor.close()

    # ========================================================================
    # MARK AS PAID
    # ========================================================================

    def mark_paid(
        self,
        invoice_id: str,
    ) -> dict[str, Any]:

        normalized_id = (
            invoice_id.strip()
            if invoice_id
            else ""
        )

        if not normalized_id:
            raise ValueError(
                "Invoice ID is required."
            )

        with get_database_connection() as connection:
            cursor = connection.cursor(
                dictionary=True
            )

            try:
                columns = self._get_columns(
                    cursor,
                    "invoices",
                )

                if not columns:
                    raise RuntimeError(
                        "invoices table was not found."
                    )

                mapping = (
                    self._invoice_mapping(
                        columns
                    )
                )

                id_column = mapping[
                    "id"
                ]

                status_column = mapping[
                    "status"
                ]

                total_column = mapping[
                    "total"
                ]

                paid_column = mapping[
                    "paid"
                ]

                if not id_column:
                    raise RuntimeError(
                        "Invoice ID column was not found."
                    )

                cursor.execute(
                    f"""
                    SELECT *
                    FROM invoices
                    WHERE CAST(`{id_column}` AS CHAR) = %s
                    LIMIT 1
                    """,
                    (
                        normalized_id,
                    ),
                )

                existing = (
                    cursor.fetchone()
                )

                if not existing:
                    raise ValueError(
                        "Invoice not found."
                    )

                total_value = (
                    self._positive_money(
                        existing.get(
                            total_column
                        )
                        if total_column
                        else 0
                    )
                )

                current_paid = (
                    self._positive_money(
                        existing.get(
                            paid_column
                        )
                        if paid_column
                        else 0
                    )
                )

                outstanding = max(
                    total_value
                    - current_paid,
                    Decimal("0.00"),
                )

                if outstanding <= 0:
                    return {
                        "status": "success",
                        "invoice_id": normalized_id,
                        "message": (
                            "Invoice is already fully paid."
                        ),
                        "paid_amount": float(
                            current_paid
                        ),
                        "outstanding": 0.0,
                    }

                updates: list[
                    str
                ] = []

                values: list[
                    Any
                ] = []

                if status_column:
                    updates.append(
                        f"`{status_column}` = %s"
                    )

                    values.append(
                        "paid"
                    )

                if paid_column:
                    updates.append(
                        f"`{paid_column}` = %s"
                    )

                    values.append(
                        float(
                            total_value
                        )
                    )

                if mapping[
                    "updated_at"
                ]:
                    updates.append(
                        f"`{mapping['updated_at']}` = NOW()"
                    )

                if not updates:
                    raise RuntimeError(
                        "No editable payment/status columns were found."
                    )

                values.append(
                    normalized_id
                )

                cursor.execute(
                    f"""
                    UPDATE invoices
                    SET {", ".join(updates)}
                    WHERE CAST(`{id_column}` AS CHAR) = %s
                    """,
                    tuple(values),
                )

                connection.commit()

                return {
                    "status": "success",
                    "invoice_id": normalized_id,
                    "message": (
                        "Invoice marked as paid."
                    ),
                    "paid_amount": float(
                        total_value
                    ),
                    "outstanding": 0.0,
                    "status": "paid",
                }

            except Exception:
                connection.rollback()
                raise

            finally:
                cursor.close()