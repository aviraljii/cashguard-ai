from __future__ import annotations

import math
import os
import sys
from datetime import date, datetime
from pathlib import Path
from typing import Any

import mysql.connector
from dotenv import load_dotenv


# ------------------------------------------------------------------
# PROJECT PATHS
# ------------------------------------------------------------------

# backend/services/invoice_intelligence.py
#
# parents[0] = services
# parents[1] = backend
# parents[2] = cashguard-ai

PROJECT_ROOT = Path(__file__).resolve().parents[2]

ML_ROOT = PROJECT_ROOT / "ml"

project_root_str = str(PROJECT_ROOT)

if project_root_str not in sys.path:
    sys.path.insert(
        0,
        project_root_str,
    )


# ------------------------------------------------------------------
# ML IMPORT
# ------------------------------------------------------------------

from ml.src.prediction.payment_delay_predictor import (  # noqa: E402
    PaymentDelayPredictor,
)


# ------------------------------------------------------------------
# ENVIRONMENT
# ------------------------------------------------------------------

load_dotenv(
    PROJECT_ROOT / ".env"
)


class InvoiceIntelligenceService:
    """
    CashGuard-AI Invoice Intelligence Service.

    Responsibilities:
        1. Read real invoice/payment data from MySQL.
        2. Support both internal invoice ID and invoice number.
        3. Calculate current invoice status.
        4. Run the existing trained payment-delay model.
        5. Calculate collection priority.
        6. Produce deterministic collection recommendations.
        7. Return structured intelligence for AI/RAG/Agent layers.

    This service does NOT:
        - train an ML model
        - retrain an ML model
        - generate fabricated data
        - call an LLM directly
    """

    def __init__(self) -> None:
        self.predictor = PaymentDelayPredictor(
            model_path=(
                ML_ROOT
                / "models"
                / "payment_delay_risk_model.joblib"
            ),
            metadata_path=(
                ML_ROOT
                / "models"
                / "payment_delay_model_metadata.json"
            ),
        )

    # ------------------------------------------------------------------
    # HELPERS
    # ------------------------------------------------------------------

    @staticmethod
    def _safe_float(
        value: Any,
        default: float = 0.0,
    ) -> float:
        """
        Convert a value to a finite float.
        """

        try:
            number = float(
                value
            )

            if not math.isfinite(
                number
            ):
                return default

            return number

        except (
            TypeError,
            ValueError,
            OverflowError,
        ):
            return default

    @staticmethod
    def _safe_text(
        value: Any,
        default: str = "",
    ) -> str:
        """
        Convert a value to trimmed text safely.
        """

        if value is None:
            return default

        try:
            text = str(
                value
            ).strip()
        except Exception:
            return default

        return (
            text
            if text
            else default
        )

    @staticmethod
    def _date_to_iso(
        value: Any,
    ) -> str:
        """
        Convert MySQL date/datetime values into ISO strings.
        """

        if value is None:
            return ""

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

        text = str(
            value
        ).strip()

        if not text:
            return ""

        # Handle accidental datetime text.
        try:
            return datetime.fromisoformat(
                text
            ).date().isoformat()
        except ValueError:
            pass

        # Handle normal date text.
        try:
            return date.fromisoformat(
                text
            ).isoformat()
        except ValueError:
            return text

    @staticmethod
    def _parse_iso_date(
        value: Any,
    ) -> date:
        """
        Parse a normalized ISO date.
        """

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

        text = str(
            value or ""
        ).strip()

        if not text:
            raise ValueError(
                "Invoice date is missing."
            )

        try:
            return date.fromisoformat(
                text[:10]
            )
        except ValueError as exc:
            raise ValueError(
                f"Invalid invoice date: {text}"
            ) from exc

    # ------------------------------------------------------------------
    # DATABASE
    # ------------------------------------------------------------------

    def _get_connection(self):
        """
        Create a MySQL application connection.

        Database credentials are loaded from the root .env file.
        """

        return mysql.connector.connect(
            host=os.getenv(
                "DB_HOST",
                "127.0.0.1",
            ),
            port=int(
                os.getenv(
                    "DB_PORT",
                    "3406",
                )
            ),
            database=os.getenv(
                "DB_NAME",
                "cashguard_ai",
            ),
            user=os.getenv(
                "DB_USER",
                "root",
            ),
            password=os.getenv(
                "DB_PASSWORD",
                "",
            ),
            connection_timeout=10,
        )

    def get_invoice(
        self,
        invoice_id: str,
    ) -> dict[str, Any]:
        """
        Fetch the current invoice state from real MySQL.

        Supports both:
            - internal database invoice ID
            - human-readable invoice_number

        Example:
            INV-2026-00482

        Payment calculation only considers payments made
        up to today.
        """

        lookup_value = self._safe_text(
            invoice_id
        )

        if not lookup_value:
            raise ValueError(
                "invoice_id is required."
            )

        query = """
        SELECT
            i.id AS invoice_id,
            i.business_id,
            i.customer_id,
            i.invoice_number,
            i.invoice_date,
            i.due_date,
            i.status AS database_status,
            i.total_amount AS invoice_amount,

            COALESCE(
                SUM(
                    CASE
                        WHEN ip.payment_date <= CURRENT_DATE
                        THEN ip.amount
                        ELSE 0
                    END
                ),
                0
            ) AS total_paid

        FROM invoices AS i

        LEFT JOIN invoice_payments AS ip
            ON ip.invoice_id = i.id

        WHERE
            (
                CAST(i.id AS CHAR) = %s
                OR i.invoice_number = %s
            )
            AND LOWER(
                COALESCE(i.status, '')
            ) <> 'void'
            AND i.invoice_date <= CURRENT_DATE

        GROUP BY
            i.id,
            i.business_id,
            i.customer_id,
            i.invoice_number,
            i.invoice_date,
            i.due_date,
            i.status,
            i.total_amount

        ORDER BY
            i.invoice_date DESC

        LIMIT 1
        """

        connection = None
        cursor = None

        try:
            connection = self._get_connection()

            cursor = connection.cursor(
                dictionary=True
            )

            cursor.execute(
                query,
                (
                    lookup_value,
                    lookup_value,
                ),
            )

            row = cursor.fetchone()

            if row is None:
                raise ValueError(
                    f"Invoice '{lookup_value}' was not found."
                )

            return self._normalize_invoice(
                row
            )

        except ValueError:
            raise

        except mysql.connector.Error as exc:
            raise RuntimeError(
                f"Database error while fetching invoice: {exc}"
            ) from exc

        finally:
            if cursor is not None:
                try:
                    cursor.close()
                except Exception:
                    pass

            if connection is not None:
                try:
                    connection.close()
                except Exception:
                    pass

    @staticmethod
    def _normalize_invoice(
        row: dict[str, Any],
    ) -> dict[str, Any]:
        """
        Normalize MySQL values into JSON-safe Python values.
        """

        invoice_date = InvoiceIntelligenceService._date_to_iso(
            row.get(
                "invoice_date"
            )
        )

        due_date = InvoiceIntelligenceService._date_to_iso(
            row.get(
                "due_date"
            )
        )

        invoice_amount = InvoiceIntelligenceService._safe_float(
            row.get(
                "invoice_amount"
            )
        )

        total_paid = InvoiceIntelligenceService._safe_float(
            row.get(
                "total_paid"
            )
        )

        # Prevent overpayment from creating negative outstanding balance.
        outstanding_amount = max(
            invoice_amount - total_paid,
            0.0,
        )

        return {
            "invoice_id": row.get(
                "invoice_id"
            ),
            "business_id": row.get(
                "business_id"
            ),
            "customer_id": row.get(
                "customer_id"
            ),
            "invoice_number": row.get(
                "invoice_number"
            ),
            "invoice_date": invoice_date,
            "due_date": due_date,
            "database_status": row.get(
                "database_status"
            ),
            "invoice_amount": round(
                invoice_amount,
                2,
            ),
            "total_paid": round(
                total_paid,
                2,
            ),
            "outstanding_amount": round(
                outstanding_amount,
                2,
            ),
        }

    # ------------------------------------------------------------------
    # INVOICE BUSINESS LOGIC
    # ------------------------------------------------------------------

    @staticmethod
    def calculate_invoice_status(
        invoice: dict[str, Any],
    ) -> tuple[str, int, int]:
        """
        Determine the current business status of an invoice.

        Returns:
            (
                invoice_status,
                overdue_days,
                invoice_age_days,
            )
        """

        today = date.today()

        invoice_date = (
            InvoiceIntelligenceService._parse_iso_date(
                invoice.get(
                    "invoice_date"
                )
            )
        )

        due_date = (
            InvoiceIntelligenceService._parse_iso_date(
                invoice.get(
                    "due_date"
                )
            )
        )

        invoice_amount = InvoiceIntelligenceService._safe_float(
            invoice.get(
                "invoice_amount"
            )
        )

        outstanding_amount = InvoiceIntelligenceService._safe_float(
            invoice.get(
                "outstanding_amount"
            )
        )

        overdue_days = max(
            (
                today - due_date
            ).days,
            0,
        )

        invoice_age_days = max(
            (
                today - invoice_date
            ).days,
            0,
        )

        # Fully settled.
        if outstanding_amount <= 0.005:
            return (
                "Paid",
                overdue_days,
                invoice_age_days,
            )

        days_until_due = (
            due_date - today
        ).days

        # More than seven days remaining.
        if days_until_due > 7:
            return (
                "Not Due",
                overdue_days,
                invoice_age_days,
            )

        # Due within seven days.
        if days_until_due >= 0:
            return (
                "Due Soon",
                overdue_days,
                invoice_age_days,
            )

        # Past due but partially settled.
        if outstanding_amount < invoice_amount:
            return (
                "Partially Paid",
                overdue_days,
                invoice_age_days,
            )

        # Past due and unpaid.
        return (
            "Overdue",
            overdue_days,
            invoice_age_days,
        )

    # ------------------------------------------------------------------
    # ML
    # ------------------------------------------------------------------

    def get_payment_risk(
        self,
        invoice_id: Any,
    ) -> dict[str, Any]:
        """
        Run the existing trained PaymentDelayPredictor
        against live invoice data.

        IMPORTANT:
        The resolved database invoice ID is used here,
        not the human-readable invoice number.
        """

        resolved_invoice_id = self._safe_text(
            invoice_id
        )

        if not resolved_invoice_id:
            return {
                "status": "unavailable",
                "risk_probability": None,
                "risk_score": None,
                "risk_category": None,
                "reason": (
                    "Resolved invoice ID is unavailable."
                ),
            }

        try:
            prediction = self.predictor.predict(
                invoice_id=resolved_invoice_id
            )

            if not isinstance(
                prediction,
                dict,
            ):
                return {
                    "status": "unavailable",
                    "risk_probability": None,
                    "risk_score": None,
                    "risk_category": None,
                    "reason": (
                        "Payment-delay predictor returned "
                        "an invalid response."
                    ),
                }

            risk_probability_raw = prediction.get(
                "risk_probability"
            )

            risk_score_raw = prediction.get(
                "risk_score"
            )

            risk_category_raw = prediction.get(
                "risk_category"
            )

            risk_probability = None
            risk_score = None

            if risk_probability_raw is not None:
                risk_probability = round(
                    self._safe_float(
                        risk_probability_raw
                    ),
                    4,
                )

            if risk_score_raw is not None:
                risk_score = round(
                    self._safe_float(
                        risk_score_raw
                    ),
                    2,
                )

            risk_category = None

            if risk_category_raw is not None:
                risk_category = self._safe_text(
                    risk_category_raw
                )

            return {
                "status": "available",
                "risk_probability": risk_probability,
                "risk_score": risk_score,
                "risk_category": risk_category,
            }

        except ValueError as exc:
            return {
                "status": "unavailable",
                "risk_probability": None,
                "risk_score": None,
                "risk_category": None,
                "reason": str(exc),
            }

        except (
            FileNotFoundError,
            OSError,
            KeyError,
            TypeError,
            RuntimeError,
        ) as exc:
            return {
                "status": "unavailable",
                "risk_probability": None,
                "risk_score": None,
                "risk_category": None,
                "reason": (
                    f"Payment-delay prediction unavailable: {exc}"
                ),
            }

        except Exception as exc:
            return {
                "status": "unavailable",
                "risk_probability": None,
                "risk_score": None,
                "risk_category": None,
                "reason": (
                    f"Payment-delay prediction unavailable: {exc}"
                ),
            }

    # ------------------------------------------------------------------
    # COLLECTION INTELLIGENCE
    # ------------------------------------------------------------------

    @staticmethod
    def calculate_collection_priority(
        *,
        invoice_status: str,
        outstanding_amount: float,
        invoice_amount: float,
        overdue_days: int,
        payment_risk_score: float | None,
        invoice_age_days: int,
    ) -> dict[str, Any]:
        """
        Calculate deterministic collection priority.

        Weights:
            Outstanding ratio -> 35%
            Overdue days       -> 30%
            ML payment risk    -> 25%
            Invoice age        -> 10%
        """

        normalized_status = str(
            invoice_status or ""
        ).strip()

        # Paid invoices require no collection action.
        if normalized_status == "Paid":
            return {
                "score": 0.0,
                "category": "Low",
                "payment_risk_available": (
                    payment_risk_score is not None
                ),
            }

        outstanding_amount = max(
            InvoiceIntelligenceService._safe_float(
                outstanding_amount
            ),
            0.0,
        )

        invoice_amount = max(
            InvoiceIntelligenceService._safe_float(
                invoice_amount
            ),
            0.0,
        )

        overdue_days = max(
            int(
                overdue_days or 0
            ),
            0,
        )

        invoice_age_days = max(
            int(
                invoice_age_days or 0
            ),
            0,
        )

        # Outstanding balance component.
        if invoice_amount > 0:
            outstanding_ratio = min(
                max(
                    outstanding_amount
                    / invoice_amount,
                    0.0,
                ),
                1.0,
            )
        else:
            outstanding_ratio = 0.0

        outstanding_score = (
            outstanding_ratio
            * 100.0
        )

        # Overdue component capped at 90 days.
        overdue_score = (
            min(
                max(
                    overdue_days / 90.0,
                    0.0,
                ),
                1.0,
            )
            * 100.0
        )

        # Invoice age component capped at 180 days.
        age_score = (
            min(
                max(
                    invoice_age_days / 180.0,
                    0.0,
                ),
                1.0,
            )
            * 100.0
        )

        normalized_risk_score: float | None = None

        if payment_risk_score is not None:
            normalized_risk_score = min(
                max(
                    InvoiceIntelligenceService._safe_float(
                        payment_risk_score
                    ),
                    0.0,
                ),
                100.0,
            )

        if normalized_risk_score is not None:
            score = (
                outstanding_score
                * 0.35
                + overdue_score
                * 0.30
                + normalized_risk_score
                * 0.25
                + age_score
                * 0.10
            )
        else:
            # Re-weight the available components.
            score = (
                (
                    outstanding_score
                    * 0.35
                    + overdue_score
                    * 0.30
                    + age_score
                    * 0.10
                )
                / 0.75
            )

        score = round(
            min(
                max(
                    score,
                    0.0,
                ),
                100.0,
            ),
            2,
        )

        if score < 25:
            category = "Low"

        elif score < 50:
            category = "Medium"

        elif score < 75:
            category = "High"

        else:
            category = "Critical"

        return {
            "score": score,
            "category": category,
            "payment_risk_available": (
                normalized_risk_score is not None
            ),
        }

    @staticmethod
    def get_recommendation(
        invoice_status: str,
        priority_category: str,
    ) -> dict[str, str]:
        """
        Deterministic recommendation layer.
        """

        normalized_status = str(
            invoice_status or ""
        ).strip()

        normalized_category = str(
            priority_category or ""
        ).strip()

        if normalized_status == "Paid":
            return {
                "action": (
                    "No collection action required."
                ),
                "urgency": "none",
            }

        if normalized_category == "Critical":
            return {
                "action": (
                    "Immediate collection follow-up "
                    "and escalation."
                ),
                "urgency": "critical",
            }

        if normalized_category == "High":
            return {
                "action": (
                    "Urgent collection follow-up."
                ),
                "urgency": "urgent",
            }

        if normalized_status in {
            "Overdue",
            "Partially Paid",
        }:
            return {
                "action": (
                    "Follow up on outstanding payment."
                ),
                "urgency": "follow_up",
            }

        if normalized_status == "Due Soon":
            return {
                "action": (
                    "Send payment reminder and monitor."
                ),
                "urgency": "monitor",
            }

        return {
            "action": "Monitor invoice.",
            "urgency": "monitor",
        }

    # ------------------------------------------------------------------
    # FINAL STRUCTURED INTELLIGENCE
    # ------------------------------------------------------------------

    def build_intelligence(
        self,
        invoice_id: str,
    ) -> dict[str, Any]:
        """
        Build complete structured invoice intelligence.

        `invoice_id` may contain either:
            - database invoice ID
            - human-readable invoice number

        The response always uses the resolved database invoice ID
        for ML prediction.
        """

        lookup_value = self._safe_text(
            invoice_id
        )

        if not lookup_value:
            raise ValueError(
                "invoice_id is required."
            )

        # --------------------------------------------------------------
        # Resolve invoice using ID OR invoice number.
        # --------------------------------------------------------------

        invoice = self.get_invoice(
            lookup_value
        )

        resolved_invoice_id = self._safe_text(
            invoice.get(
                "invoice_id"
            )
        )

        if not resolved_invoice_id:
            raise ValueError(
                "Invoice was found but its database ID is missing."
            )

        # --------------------------------------------------------------
        # Calculate invoice status.
        # --------------------------------------------------------------

        (
            invoice_status,
            overdue_days,
            invoice_age_days,
        ) = self.calculate_invoice_status(
            invoice
        )

        # --------------------------------------------------------------
        # Run payment-delay model using INTERNAL ID.
        # --------------------------------------------------------------

        payment_risk = self.get_payment_risk(
            resolved_invoice_id
        )

        risk_score = payment_risk.get(
            "risk_score"
        )

        if risk_score is not None:
            try:
                risk_score = min(
                    max(
                        self._safe_float(
                            risk_score
                        ),
                        0.0,
                    ),
                    100.0,
                )
            except Exception:
                risk_score = None

        # --------------------------------------------------------------
        # Calculate collection priority.
        # --------------------------------------------------------------

        collection_priority = (
            self.calculate_collection_priority(
                invoice_status=invoice_status,
                outstanding_amount=invoice.get(
                    "outstanding_amount",
                    0.0,
                ),
                invoice_amount=invoice.get(
                    "invoice_amount",
                    0.0,
                ),
                overdue_days=overdue_days,
                payment_risk_score=risk_score,
                invoice_age_days=invoice_age_days,
            )
        )

        # --------------------------------------------------------------
        # Deterministic recommendation.
        # --------------------------------------------------------------

        recommendation = self.get_recommendation(
            invoice_status,
            collection_priority[
                "category"
            ],
        )

        # --------------------------------------------------------------
        # Final structured output.
        # --------------------------------------------------------------

        return {
            "domain": "invoice_collection",

            "invoice": {
                **invoice,
                "invoice_status": invoice_status,
                "overdue_days": overdue_days,
                "invoice_age_days": invoice_age_days,
            },

            "payment_risk": payment_risk,

            "collection_priority": (
                collection_priority
            ),

            "collection_recommendation": (
                recommendation
            ),
        }