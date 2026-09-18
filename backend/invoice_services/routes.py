from __future__ import annotations

import logging
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Any

from fastapi import (
    APIRouter,
    HTTPException,
    Query,
    status,
)
from pydantic import BaseModel, ConfigDict, Field, field_validator

from .service import InvoiceService


logger = logging.getLogger(__name__)


# ============================================================================
# ROUTER
# ============================================================================

router = APIRouter(
    prefix="/invoices",
    tags=["Invoices"],
)


# ============================================================================
# SERVICE
# ============================================================================

service = InvoiceService()


# ============================================================================
# REQUEST SCHEMA
# ============================================================================

class CreateInvoiceRequest(BaseModel):
    """
    Request body for creating a live invoice.

    The schema intentionally matches the existing
    InvoiceService.create_invoice() method.
    """

    model_config = ConfigDict(
        extra="ignore"
    )

    business_id: str = Field(
        ...,
        min_length=1,
        max_length=64,
        description="Business UUID.",
        examples=[
            "9ae1ca9a-c01b-423f-8f5c-7af4a702a6f1"
        ],
    )

    customer_id: str = Field(
        ...,
        min_length=1,
        max_length=64,
        description="Customer UUID.",
    )

    subtotal: Decimal = Field(
        ...,
        gt=Decimal("0"),
        description="Taxable invoice amount before GST.",
        examples=[10000],
    )

    gst_rate: Decimal = Field(
        default=Decimal("5"),
        ge=Decimal("0"),
        le=Decimal("100"),
        description="GST percentage.",
        examples=[5],
    )

    gst_type: str = Field(
        default="CGST_SGST",
        min_length=3,
        max_length=20,
        description="CGST_SGST or IGST.",
        examples=["CGST_SGST"],
    )

    invoice_date: date | None = Field(
        default=None,
        description="Invoice date. Defaults to today.",
    )

    due_date: date | None = Field(
        default=None,
        description="Payment due date. Defaults to invoice date + 30 days.",
    )

    description: str = Field(
        default="Invoice",
        max_length=500,
        description="Invoice description.",
    )

    reference: str = Field(
        default="",
        max_length=150,
        description="PO/reference number.",
    )

    notes: str = Field(
        default="",
        max_length=2000,
        description="Invoice notes.",
    )

    sale_id: str | None = Field(
        default=None,
        max_length=64,
        description="Optional linked sale ID.",
    )

    status: str = Field(
        default="draft",
        max_length=20,
        description="draft, sent, due, overdue, paid, or cancelled.",
    )

    @field_validator(
        "business_id",
        "customer_id",
        mode="before",
    )
    @classmethod
    def validate_ids(
        cls,
        value: Any,
    ) -> str:
        text = str(value or "").strip()

        if not text:
            raise ValueError(
                "ID cannot be empty."
            )

        return text

    @field_validator(
        "description",
        "reference",
        "notes",
        mode="before",
    )
    @classmethod
    def normalize_text(
        cls,
        value: Any,
    ) -> str:
        return str(
            value or ""
        ).strip()

    @field_validator(
        "gst_type",
        mode="before",
    )
    @classmethod
    def normalize_gst_type(
        cls,
        value: Any,
    ) -> str:
        normalized = (
            str(
                value or "CGST_SGST"
            )
            .strip()
            .upper()
            .replace(
                "-",
                "_",
            )
        )

        aliases = {
            "CGSTSGST": "CGST_SGST",
            "CGST_SGST": "CGST_SGST",
            "CGST+SGST": "CGST_SGST",
            "INTRA_STATE": "CGST_SGST",
            "INTRASTATE": "CGST_SGST",
            "IGST": "IGST",
            "INTER_STATE": "IGST",
            "INTERSTATE": "IGST",
        }

        if normalized not in aliases:
            raise ValueError(
                "gst_type must be CGST_SGST or IGST."
            )

        return aliases[normalized]

    @field_validator(
        "subtotal",
        "gst_rate",
        mode="before",
    )
    @classmethod
    def validate_decimal(
        cls,
        value: Any,
    ) -> Decimal:

        try:
            decimal_value = Decimal(
                str(value)
            )
        except (
            InvalidOperation,
            ValueError,
            TypeError,
        ) as exc:
            raise ValueError(
                "Value must be a valid number."
            ) from exc

        if not decimal_value.is_finite():
            raise ValueError(
                "Value must be finite."
            )

        return decimal_value.quantize(
            Decimal("0.01")
        )


# ============================================================================
# LIST INVOICES
# ============================================================================

@router.get("")
def get_invoices(
    search: str = Query(
        default="",
        description=(
            "Search invoice ID, invoice number, "
            "customer, reference, etc."
        ),
    ),
    status_filter: str = Query(
        default="All",
        alias="status",
        description="Invoice status filter.",
    ),
    page: int = Query(
        default=1,
        ge=1,
        description="Page number.",
    ),
    page_size: int = Query(
        default=20,
        ge=1,
        le=500,
        description="Records per page.",
    ),
    limit: int | None = Query(
        default=None,
        ge=1,
        le=500,
        description=(
            "Optional limit for compatibility "
            "with existing frontend calls."
        ),
    ),
    offset: int | None = Query(
        default=None,
        ge=0,
        description=(
            "Optional offset for compatibility "
            "with existing frontend calls."
        ),
    ),
) -> dict[str, Any]:
    """
    Return live invoices from MySQL.

    Supports both:

        /api/invoices?page=1&page_size=20

    and:

        /api/invoices?limit=20&offset=0
    """

    try:
        normalized_search = (
            search.strip()
        )

        normalized_status = (
            status_filter.strip()
            if status_filter
            else "All"
        ) or "All"

        # --------------------------------------------------------------
        # Resolve pagination.
        # --------------------------------------------------------------

        if (
            limit is not None
            or offset is not None
        ):
            resolved_page_size = (
                limit
                if limit is not None
                else page_size
            )

            resolved_offset = (
                offset
                if offset is not None
                else 0
            )

            resolved_page = (
                resolved_offset
                // resolved_page_size
            ) + 1

        else:
            resolved_page = page
            resolved_page_size = page_size

        result = service.list_invoices(
            search=normalized_search,
            status=normalized_status,
            page=resolved_page,
            page_size=resolved_page_size,
        )

        if isinstance(
            result,
            dict,
        ):
            return result

        return {
            "status": "success",
            "data": result,
        }

    except ValueError as exc:
        logger.warning(
            "Invalid invoice list request: %s",
            exc,
        )

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    except Exception as exc:
        logger.exception(
            "Failed to list invoices."
        )

        raise HTTPException(
            status_code=(
                status.HTTP_500_INTERNAL_SERVER_ERROR
            ),
            detail="Failed to load invoices.",
        ) from exc


# ============================================================================
# CREATE INVOICE
# ============================================================================

@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
)
def create_invoice(
    payload: CreateInvoiceRequest,
) -> dict[str, Any]:
    """
    Create a real invoice in MySQL.

    Flow:

        request
          ↓
        validation
          ↓
        customer validation
          ↓
        GST calculation
          ↓
        invoice number
          ↓
        MySQL INSERT
          ↓
        normalized invoice response
    """

    try:
        result = service.create_invoice(
            business_id=(
                payload.business_id
            ),
            customer_id=(
                payload.customer_id
            ),
            subtotal=(
                payload.subtotal
            ),
            gst_rate=(
                payload.gst_rate
            ),
            gst_type=(
                payload.gst_type
            ),
            due_date=(
                payload.due_date
            ),
            invoice_date=(
                payload.invoice_date
            ),
            description=(
                payload.description
                or "Invoice"
            ),
            reference=(
                payload.reference
            ),
            notes=(
                payload.notes
            ),
            sale_id=(
                payload.sale_id
            ),
            status=(
                payload.status
            ),
        )

        return result

    except ValueError as exc:
        logger.warning(
            "Invoice creation validation failed: %s",
            exc,
        )

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    except Exception as exc:
        logger.exception(
            "Failed to create invoice."
        )

        raise HTTPException(
            status_code=(
                status.HTTP_500_INTERNAL_SERVER_ERROR
            ),
            detail="Failed to create invoice.",
        ) from exc


# ============================================================================
# GET SINGLE INVOICE
# ============================================================================

@router.get(
    "/{invoice_id}"
)
def get_invoice(
    invoice_id: str,
) -> dict[str, Any]:
    """
    Return one normalized live invoice.
    """

    normalized_invoice_id = (
        invoice_id.strip()
    )

    if not normalized_invoice_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invoice ID is required.",
        )

    try:
        invoice = service.get_invoice(
            normalized_invoice_id
        )

        if invoice is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Invoice not found.",
            )

        return {
            "status": "success",
            "data": invoice,
        }

    except HTTPException:
        raise

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    except Exception as exc:
        logger.exception(
            "Failed to fetch invoice %s.",
            normalized_invoice_id,
        )

        raise HTTPException(
            status_code=(
                status.HTTP_500_INTERNAL_SERVER_ERROR
            ),
            detail="Failed to load invoice.",
        ) from exc


# ============================================================================
# MARK INVOICE AS PAID
# ============================================================================

@router.post(
    "/{invoice_id}/pay"
)
def mark_invoice_paid(
    invoice_id: str,
) -> dict[str, Any]:
    """
    Mark an invoice as fully paid.

    Existing payment logic stays inside InvoiceService.
    """

    normalized_invoice_id = (
        invoice_id.strip()
    )

    if not normalized_invoice_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invoice ID is required.",
        )

    try:
        result = service.mark_paid(
            normalized_invoice_id
        )

        if isinstance(
            result,
            dict,
        ):
            return result

        return {
            "status": "success",
            "invoice_id": (
                normalized_invoice_id
            ),
            "data": result,
        }

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    except Exception as exc:
        logger.exception(
            "Failed to mark invoice %s as paid.",
            normalized_invoice_id,
        )

        raise HTTPException(
            status_code=(
                status.HTTP_500_INTERNAL_SERVER_ERROR
            ),
            detail=(
                "Failed to mark invoice as paid."
            ),
        ) from exc


# ============================================================================
# PAYMENT HISTORY
# ============================================================================

@router.get(
    "/{invoice_id}/payments"
)
def get_invoice_payments(
    invoice_id: str,
) -> dict[str, Any]:
    """
    Return real payment history for an invoice.
    """

    normalized_invoice_id = (
        invoice_id.strip()
    )

    if not normalized_invoice_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invoice ID is required.",
        )

    try:
        invoice = service.get_invoice(
            normalized_invoice_id
        )

        if invoice is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Invoice not found.",
            )

        payments = invoice.get(
            "payments",
            [],
        )

        total_paid = sum(
            (
                Decimal(
                    str(
                        payment.get(
                            "amount",
                            0,
                        )
                        or 0
                    )
                )
                for payment in payments
            ),
            Decimal("0.00"),
        )

        return {
            "status": "success",
            "invoice_id": (
                normalized_invoice_id
            ),
            "total_payments": len(
                payments
            ),
            "total_paid": float(
                total_paid
            ),
            "data": payments,
        }

    except HTTPException:
        raise

    except Exception as exc:
        logger.exception(
            "Failed to fetch payment history for invoice %s.",
            normalized_invoice_id,
        )

        raise HTTPException(
            status_code=(
                status.HTTP_500_INTERNAL_SERVER_ERROR
            ),
            detail=(
                "Failed to fetch invoice payments."
            ),
        ) from exc


# ============================================================================
# ROUTE EXPORT
# ============================================================================

__all__ = [
    "router",
    "CreateInvoiceRequest",
]