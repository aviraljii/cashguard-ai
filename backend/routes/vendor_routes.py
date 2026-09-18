from __future__ import annotations

import json
import logging
import os
import urllib.error
import urllib.request
from datetime import date, datetime
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from auth_service.database import get_db
from auth_service.routes.auth import get_authenticated_user
from paisa.agent import generate_paisa_answer
from paisa.models import BusinessMembership

logger = logging.getLogger("cashguard.vendor.routes")

router = APIRouter(
    prefix="/vendors",
    tags=["Vendors"],
)

VendorRisk = Literal["Low", "Medium", "High"]
VendorPayment = Literal["On Time", "Due Soon", "Overdue"]
VendorStatus = Literal["Active", "Inactive"]


# ============================================================================
# RESPONSE MODELS
# ============================================================================


class VendorRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    name: str
    contact: str
    purchases: float
    outstanding: float
    dueSoon: float
    overdue: float
    lastPayment: str | None
    payment: VendorPayment
    risk: VendorRisk
    status: VendorStatus

    agingAvailable: bool = False
    payablesSource: str | None = None
    riskScore: int = 0
    riskProbability: float = 0.0
    mlAvailable: bool = False
    mlModel: str | None = None


class VendorSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")

    totalVendors: int
    activeVendors: int
    totalPayables: float
    dueSoon: float
    overdue: float


class VendorListResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["success"]
    businessId: str
    total: int
    summary: VendorSummary
    data: list[VendorRecord]
    generatedAt: str


class VendorIntelligenceResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["success"]
    businessId: str
    vendor: VendorRecord
    ai: dict[str, Any]
    generatedAt: str


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


def _safe_float(value: Any) -> float:
    try:
        parsed = float(value or 0)
    except (TypeError, ValueError):
        return 0.0
    if parsed != parsed:  # NaN
        return 0.0
    return parsed


def _non_negative(value: Any) -> float:
    return max(_safe_float(value), 0.0)


def _iso(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    text_value = str(value).strip()
    return text_value or None


def _allowed_business_ids(db: Session, current_user: Any) -> set[str]:
    rows = db.scalars(
        select(BusinessMembership.business_id).where(
            BusinessMembership.user_id == int(current_user.id),
        )
    ).all()
    return {
        str(value).strip()
        for value in rows
        if str(value).strip()
    }


def _authorized_business_id(
    db: Session,
    current_user: Any,
    requested_business_id: str | None,
) -> str:
    allowed = _allowed_business_ids(db, current_user)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No business is configured for this account.",
        )

    requested = (requested_business_id or "").strip()
    if requested and requested not in allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to access this business.",
        )

    return requested or sorted(allowed)[0]


# ============================================================================
# VENDOR RISK CONTROL
# ============================================================================


def calculate_vendor_control_risk(
    *,
    purchases: float,
    outstanding: float,
    overdue: float,
    failed_payment_count: int = 0,
) -> dict[str, Any]:
    """
    Deterministic fallback control score used when invoice-level ML
    predictions are unavailable for a vendor.

    This is deliberately labeled as a control score, not a trained model.
    """

    purchases_value = _non_negative(purchases)
    outstanding_value = _non_negative(outstanding)
    overdue_value = _non_negative(overdue)
    failure_count = max(int(failed_payment_count or 0), 0)

    outstanding_ratio = (
        min(outstanding_value / purchases_value, 1.0)
        if purchases_value > 0
        else (1.0 if outstanding_value > 0 else 0.0)
    )
    overdue_ratio = (
        min(overdue_value / outstanding_value, 1.0)
        if outstanding_value > 0
        else 0.0
    )
    failure_signal = min(failure_count / 3.0, 1.0)

    raw_score = (
        outstanding_ratio * 30.0
        + overdue_ratio * 55.0
        + failure_signal * 15.0
    )
    score = max(0, min(int(round(raw_score)), 100))

    if score >= 67:
        category: VendorRisk = "High"
    elif score >= 34:
        category = "Medium"
    else:
        category = "Low"

    return {
        "risk_score": score,
        "risk_category": category,
        "risk_probability": round(score / 100.0, 4),
        "model": "vendor-risk-control-v1",
    }


# ============================================================================
# PAYABLE SOURCE DISCOVERY
# ============================================================================


def _resolve_payable_source(db: Session) -> dict[str, str] | None:
    table_candidates = [
        "purchase_invoices",
        "supplier_invoices",
        "vendor_invoices",
        "purchases",
        "expenses",
    ]

    for table_name in table_candidates:
        if not _table_exists(db, table_name):
            continue

        columns = _table_columns(db, table_name)
        supplier_column = _pick_column(
            columns,
            [
                "supplier_id",
                "vendor_id",
                "supplier_uuid",
                "vendor_uuid",
            ],
        )
        amount_column = _pick_column(
            columns,
            [
                "total_amount",
                "grand_total",
                "invoice_total",
                "amount",
                "net_amount",
                "expense_amount",
                "value",
                "price",
            ],
        )

        if not supplier_column or not amount_column:
            continue

        return {
            "table": table_name,
            "supplier_column": supplier_column,
            "business_column": _pick_column(
                columns,
                ["business_id", "business_uuid", "company_id"],
            ) or "",
            "amount_column": amount_column,
            "paid_column": _pick_column(
                columns,
                ["amount_paid", "paid_amount", "received_amount"],
            ) or "",
            "status_column": _pick_column(
                columns,
                ["status", "payment_status", "invoice_status"],
            ) or "",
            "due_date_column": _pick_column(
                columns,
                ["due_date", "payment_due_date", "expected_payment_date"],
            ) or "",
            "invoice_id_column": _pick_column(
                columns,
                ["invoice_id", "supplier_invoice_id", "vendor_invoice_id"],
            ) or "",
            "date_column": _pick_column(
                columns,
                [
                    "purchase_date",
                    "invoice_date",
                    "expense_date",
                    "date",
                    "created_at",
                ],
            ) or "",
        }

    return None


def _payment_source_columns(db: Session) -> dict[str, str] | None:
    if not _table_exists(db, "payments"):
        return None

    columns = _table_columns(db, "payments")
    supplier_column = _pick_column(
        columns,
        ["supplier_id", "vendor_id", "supplier_uuid", "vendor_uuid"],
    )
    amount_column = _pick_column(
        columns,
        ["amount", "total_amount", "paid_amount"],
    )

    if not supplier_column or not amount_column:
        return None

    return {
        "supplier_column": supplier_column,
        "business_column": _pick_column(
            columns,
            ["business_id", "business_uuid", "company_id"],
        ) or "",
        "amount_column": amount_column,
        "status_column": _pick_column(
            columns,
            ["status", "payment_status"],
        ) or "",
        "date_column": _pick_column(
            columns,
            ["payment_date", "date", "created_at"],
        ) or "",
    }


def _fetch_vendor_payment_metrics(
    db: Session,
    business_id: str,
    supplier_id: str,
) -> dict[str, Any]:
    source = _payment_source_columns(db)
    if source is None:
        return {
            "total_paid": 0.0,
            "last_payment": None,
            "failed_count": 0,
        }

    where = [
        f"{_quote_identifier(source['supplier_column'])} = :supplier_id",
    ]
    params: dict[str, Any] = {"supplier_id": supplier_id}

    if source["business_column"]:
        where.append(
            f"{_quote_identifier(source['business_column'])} = :business_id"
        )
        params["business_id"] = business_id

    status_expr = ""
    if source["status_column"]:
        status_expr = _quote_identifier(source["status_column"])

    paid_condition = "1=1"
    if status_expr:
        paid_condition = (
            f"LOWER(COALESCE({status_expr}, '')) NOT IN "
            "('failed', 'cancelled', 'canceled', 'rejected', 'declined', 'refunded')"
        )

    total_sql = f"""
        SELECT COALESCE(
            SUM(CASE WHEN {paid_condition}
                THEN COALESCE({_quote_identifier(source['amount_column'])}, 0)
                ELSE 0 END
            ), 0
        ) AS total_paid
        FROM `payments`
        WHERE {' AND '.join(where)}
    """
    total_paid = _safe_float(
        db.execute(text(total_sql), params).scalar_one()
    )

    last_payment = None
    if source["date_column"]:
        date_sql = f"""
            SELECT MAX({_quote_identifier(source['date_column'])})
            FROM `payments`
            WHERE {' AND '.join(where)}
              AND {paid_condition}
        """
        last_payment = _iso(
            db.execute(text(date_sql), params).scalar_one()
        )

    failed_count = 0
    if status_expr:
        failed_sql = f"""
            SELECT COUNT(*)
            FROM `payments`
            WHERE {' AND '.join(where)}
              AND LOWER(COALESCE({status_expr}, ''))
                  IN ('failed', 'rejected', 'declined')
        """
        failed_count = int(
            db.execute(text(failed_sql), params).scalar_one() or 0
        )

    return {
        "total_paid": round(total_paid, 2),
        "last_payment": last_payment,
        "failed_count": failed_count,
    }


def _fetch_vendor_payables(
    db: Session,
    business_id: str,
    supplier_id: str,
) -> dict[str, Any]:
    source = _resolve_payable_source(db)
    payment_metrics = _fetch_vendor_payment_metrics(
        db,
        business_id,
        supplier_id,
    )

    if source is None:
        return {
            "purchases": 0.0,
            "outstanding": 0.0,
            "dueSoon": 0.0,
            "overdue": 0.0,
            "purchase_count": 0,
            "aging_available": False,
            "source": None,
            "invoice_ids": [],
            **payment_metrics,
        }

    table = _quote_identifier(source["table"])
    supplier_column = _quote_identifier(source["supplier_column"])
    amount_column = _quote_identifier(source["amount_column"])

    where = [f"{supplier_column} = :supplier_id"]
    params: dict[str, Any] = {"supplier_id": supplier_id}

    if source["business_column"]:
        where.append(
            f"{_quote_identifier(source['business_column'])} = :business_id"
        )
        params["business_id"] = business_id

    status_column = source["status_column"]
    status_expr = (
        _quote_identifier(status_column)
        if status_column
        else ""
    )
    if status_expr:
        where.append(
            f"LOWER(COALESCE({status_expr}, '')) NOT IN "
            "('cancelled', 'canceled', 'void')"
        )

    amount_expr = f"COALESCE({amount_column}, 0)"
    paid_column = source["paid_column"]
    due_date_column = source["due_date_column"]
    aging_available = bool(paid_column or status_expr) and bool(due_date_column)

    if paid_column:
        open_expr = (
            f"GREATEST({amount_expr} - "
            f"COALESCE({_quote_identifier(paid_column)}, 0), 0)"
        )
    elif status_expr:
        open_expr = (
            f"CASE WHEN LOWER(COALESCE({status_expr}, '')) IN "
            "('paid', 'settled', 'completed') THEN 0 "
            f"ELSE GREATEST({amount_expr}, 0) END"
        )
    else:
        open_expr = f"GREATEST({amount_expr}, 0)"

    aggregate_sql = f"""
        SELECT
            COUNT(*) AS purchase_count,
            COALESCE(SUM({amount_expr}), 0) AS purchases,
            COALESCE(SUM({open_expr}), 0) AS calculated_outstanding
        FROM {table}
        WHERE {' AND '.join(where)}
    """
    aggregate_row = db.execute(
        text(aggregate_sql),
        params,
    ).mappings().one()

    purchases = _safe_float(aggregate_row.get("purchases"))
    calculated_outstanding = _safe_float(
        aggregate_row.get("calculated_outstanding")
    )

    outstanding = calculated_outstanding
    # When the payables source does not carry payment values, use the live
    # supplier payment ledger rather than pretending the entire purchase
    # amount is still payable.
    if not paid_column and not status_expr:
        outstanding = max(
            purchases - _safe_float(payment_metrics.get("total_paid")),
            0.0,
        )

    due_soon = 0.0
    overdue = 0.0

    if aging_available and due_date_column:
        due_column = _quote_identifier(due_date_column)
        aging_base = " AND ".join(where)

        due_soon_sql = f"""
            SELECT COALESCE(SUM({open_expr}), 0)
            FROM {table}
            WHERE {aging_base}
              AND {open_expr} > 0
              AND DATE({due_column}) >= CURRENT_DATE
              AND DATE({due_column}) <= DATE_ADD(CURRENT_DATE, INTERVAL 7 DAY)
        """
        overdue_sql = f"""
            SELECT COALESCE(SUM({open_expr}), 0)
            FROM {table}
            WHERE {aging_base}
              AND {open_expr} > 0
              AND DATE({due_column}) < CURRENT_DATE
        """
        due_soon = _safe_float(
            db.execute(text(due_soon_sql), params).scalar_one()
        )
        overdue = _safe_float(
            db.execute(text(overdue_sql), params).scalar_one()
        )

    invoice_ids: list[str] = []
    invoice_id_column = source["invoice_id_column"]
    if invoice_id_column:
        invoice_sql = f"""
            SELECT DISTINCT {_quote_identifier(invoice_id_column)} AS invoice_id
            FROM {table}
            WHERE {' AND '.join(where)}
              AND {_quote_identifier(invoice_id_column)} IS NOT NULL
            LIMIT 10
        """
        rows = db.execute(text(invoice_sql), params).scalars().all()
        invoice_ids = [
            str(value).strip()
            for value in rows
            if value is not None and str(value).strip()
        ]

    return {
        "purchases": round(purchases, 2),
        "outstanding": round(outstanding, 2),
        "dueSoon": round(due_soon, 2),
        "overdue": round(overdue, 2),
        "purchase_count": int(aggregate_row.get("purchase_count") or 0),
        "aging_available": aging_available,
        "source": source["table"],
        "invoice_ids": invoice_ids,
        **payment_metrics,
    }


# ============================================================================
# ML CONTROL
# ============================================================================


def _fetch_invoice_ml_prediction(invoice_id: str) -> dict[str, Any] | None:
    base_url = (
        os.getenv("CASHGUARD_ML_BASE_URL")
        or "http://127.0.0.1:8001"
    ).rstrip("/")

    payload = json.dumps({"invoice_id": invoice_id}).encode("utf-8")
    request = urllib.request.Request(
        f"{base_url}/predict/payment-delay",
        data=payload,
        headers={
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=3.0) as response:
            body = json.loads(
                response.read().decode("utf-8", errors="replace")
            )
        if not isinstance(body, dict):
            return None
        return body
    except (
        urllib.error.HTTPError,
        urllib.error.URLError,
        TimeoutError,
        ValueError,
        OSError,
    ):
        return None


def _vendor_ml_risk(invoice_ids: list[str]) -> dict[str, Any]:
    if not invoice_ids:
        return {
            "available": False,
            "risk_score": 0,
            "risk_probability": 0.0,
            "risk_category": "Low",
            "model": None,
            "predictions_used": 0,
        }

    scores: list[float] = []
    probabilities: list[float] = []
    model_names: list[str] = []

    for invoice_id in invoice_ids[:5]:
        result = _fetch_invoice_ml_prediction(invoice_id)
        if not result:
            continue

        score = _safe_float(result.get("risk_score"))
        probability = _safe_float(result.get("risk_probability"))
        model = str(result.get("model") or "").strip()

        if score >= 0:
            scores.append(max(0.0, min(score, 100.0)))
        if probability >= 0:
            probabilities.append(max(0.0, min(probability, 1.0)))
        if model:
            model_names.append(model)

    if not scores and not probabilities:
        return {
            "available": False,
            "risk_score": 0,
            "risk_probability": 0.0,
            "risk_category": "Low",
            "model": None,
            "predictions_used": 0,
        }

    average_score = (
        sum(scores) / len(scores)
        if scores
        else (sum(probabilities) / len(probabilities)) * 100.0
    )
    average_probability = (
        sum(probabilities) / len(probabilities)
        if probabilities
        else average_score / 100.0
    )

    score_int = max(0, min(int(round(average_score)), 100))
    if score_int >= 67:
        category: VendorRisk = "High"
    elif score_int >= 34:
        category = "Medium"
    else:
        category = "Low"

    return {
        "available": True,
        "risk_score": score_int,
        "risk_probability": round(average_probability, 4),
        "risk_category": category,
        "model": model_names[0] if model_names else "payment-delay-ml",
        "predictions_used": max(len(scores), len(probabilities)),
    }


# ============================================================================
# VENDOR SERIALIZATION
# ============================================================================


def _normalize_vendor_status(value: Any) -> VendorStatus:
    normalized = str(value or "active").strip().lower()
    if normalized in {"inactive", "disabled", "archived", "false", "0"}:
        return "Inactive"
    return "Active"


def _payment_status(
    *,
    outstanding: float,
    due_soon: float,
    overdue: float,
) -> VendorPayment:
    if overdue > 0:
        return "Overdue"
    if due_soon > 0:
        return "Due Soon"
    if outstanding <= 0:
        return "On Time"
    # No due date exists, so the backend does not claim overdue status.
    return "On Time"


def _build_vendor_record(
    db: Session,
    business_id: str,
    row: dict[str, Any],
) -> tuple[VendorRecord, dict[str, Any], dict[str, Any]]:
    supplier_id = str(row.get("id") or "").strip()
    if not supplier_id:
        raise ValueError("Supplier row is missing an id.")

    name = str(
        row.get("name")
        or row.get("full_name")
        or row.get("company_name")
        or row.get("supplier_name")
        or f"Supplier {supplier_id[:8]}"
    ).strip()
    email = str(row.get("email") or "").strip()
    phone = str(row.get("phone") or "").strip()
    contact = email or phone or ""

    payable_metrics = _fetch_vendor_payables(
        db,
        business_id,
        supplier_id,
    )

    control_risk = calculate_vendor_control_risk(
        purchases=payable_metrics["purchases"],
        outstanding=payable_metrics["outstanding"],
        overdue=payable_metrics["overdue"],
        failed_payment_count=payable_metrics["failed_count"],
    )
    ml_risk = _vendor_ml_risk(
        payable_metrics["invoice_ids"]
    )

    selected_risk = ml_risk if ml_risk["available"] else control_risk

    vendor = VendorRecord(
        id=supplier_id,
        name=name,
        contact=contact,
        purchases=round(payable_metrics["purchases"], 2),
        outstanding=round(payable_metrics["outstanding"], 2),
        dueSoon=round(payable_metrics["dueSoon"], 2),
        overdue=round(payable_metrics["overdue"], 2),
        lastPayment=payable_metrics.get("last_payment"),
        payment=_payment_status(
            outstanding=payable_metrics["outstanding"],
            due_soon=payable_metrics["dueSoon"],
            overdue=payable_metrics["overdue"],
        ),
        risk=selected_risk["risk_category"],
        status=_normalize_vendor_status(row.get("status")),
        agingAvailable=bool(payable_metrics["aging_available"]),
        payablesSource=payable_metrics.get("source"),
        riskScore=int(selected_risk["risk_score"]),
        riskProbability=float(selected_risk["risk_probability"]),
        mlAvailable=bool(ml_risk["available"]),
        mlModel=ml_risk.get("model"),
    )

    return vendor, payable_metrics, ml_risk


# ============================================================================
# VENDOR LOADING
# ============================================================================


def _load_vendor_rows(
    db: Session,
    business_id: str,
    vendor_id: str | None = None,
) -> list[dict[str, Any]]:
    if not _table_exists(db, "suppliers"):
        raise HTTPException(
            status_code=500,
            detail="The suppliers table is not available in the configured database.",
        )

    columns = _table_columns(db, "suppliers")
    business_column = _pick_column(
        columns,
        ["business_id", "business_uuid", "company_id"],
    )
    if not business_column:
        raise HTTPException(
            status_code=500,
            detail="The suppliers table does not expose business ownership.",
        )

    where = [
        f"{_quote_identifier(business_column)} = :business_id",
    ]
    params: dict[str, Any] = {"business_id": business_id}

    if vendor_id:
        where.append("CAST(`id` AS CHAR) = :vendor_id")
        params["vendor_id"] = vendor_id

    order_by = ""
    created_column = _pick_column(columns, ["created_at", "updated_at"])
    if created_column:
        order_by = f" ORDER BY {_quote_identifier(created_column)} DESC"

    result = db.execute(
        text(
            f"SELECT * FROM `suppliers` "
            f"WHERE {' AND '.join(where)}"
            f"{order_by}"
        ),
        params,
    )
    return [dict(row) for row in result.mappings().all()]


# ============================================================================
# ROUTES
# ============================================================================


@router.get(
    "",
    response_model=VendorListResponse,
)
def list_vendors(
    business_id: str | None = Query(default=None),
    current_user: Any = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
) -> VendorListResponse:
    authorized_business_id = _authorized_business_id(
        db,
        current_user,
        business_id,
    )

    rows = _load_vendor_rows(
        db,
        authorized_business_id,
    )

    vendors: list[VendorRecord] = []
    for row in rows:
        try:
            vendor, _, _ = _build_vendor_record(
                db,
                authorized_business_id,
                row,
            )
            vendors.append(vendor)
        except (HTTPException, ValueError):
            raise
        except Exception:
            logger.exception(
                "Failed to build vendor record supplier_id=%s business_id=%s",
                row.get("id"),
                authorized_business_id,
            )

    summary = VendorSummary(
        totalVendors=len(vendors),
        activeVendors=sum(
            1 for vendor in vendors if vendor.status == "Active"
        ),
        totalPayables=round(
            sum(vendor.outstanding for vendor in vendors),
            2,
        ),
        dueSoon=round(
            sum(vendor.dueSoon for vendor in vendors),
            2,
        ),
        overdue=round(
            sum(vendor.overdue for vendor in vendors),
            2,
        ),
    )

    return VendorListResponse(
        status="success",
        businessId=authorized_business_id,
        total=len(vendors),
        summary=summary,
        data=vendors,
        generatedAt=datetime.utcnow().isoformat(),
    )


@router.get(
    "/{vendor_id}",
    response_model=VendorRecord,
)
def get_vendor(
    vendor_id: str,
    business_id: str | None = Query(default=None),
    current_user: Any = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
) -> VendorRecord:
    authorized_business_id = _authorized_business_id(
        db,
        current_user,
        business_id,
    )

    rows = _load_vendor_rows(
        db,
        authorized_business_id,
        vendor_id.strip(),
    )

    if not rows:
        raise HTTPException(
            status_code=404,
            detail="Vendor not found.",
        )

    vendor, _, _ = _build_vendor_record(
        db,
        authorized_business_id,
        rows[0],
    )
    return vendor


@router.get(
    "/{vendor_id}/intelligence",
    response_model=VendorIntelligenceResponse,
)
def get_vendor_intelligence(
    vendor_id: str,
    business_id: str | None = Query(default=None),
    current_user: Any = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
) -> VendorIntelligenceResponse:
    authorized_business_id = _authorized_business_id(
        db,
        current_user,
        business_id,
    )

    rows = _load_vendor_rows(
        db,
        authorized_business_id,
        vendor_id.strip(),
    )

    if not rows:
        raise HTTPException(
            status_code=404,
            detail="Vendor not found.",
        )

    vendor, payable_metrics, ml_risk = _build_vendor_record(
        db,
        authorized_business_id,
        rows[0],
    )

    context = {
        "data_completeness": {
            "sources": [
                source
                for source in [
                    "suppliers",
                    payable_metrics.get("source"),
                    "payments" if payable_metrics.get("last_payment") else None,
                    "payment-delay-ml" if ml_risk.get("available") else None,
                ]
                if source
            ],
        },
        "vendors": {
            "available": True,
            "count_loaded": 1,
            "target": vendor.model_dump(),
        },
        "vendor_payables": payable_metrics,
        "vendor_ml": ml_risk,
    }

    question = (
        f"Give practical vendor intelligence for {vendor.name}. "
        "Explain current payable exposure, payment status, risk, "
        "ML result when available, and the most relevant next action. "
        "Use only the supplied live data and clearly state when aging or ML data is unavailable."
    )

    try:
        answer, model, sources = generate_paisa_answer(
            question,
            context,
            "vendors",
            [],
        )
        ai_payload = {
            "answer": answer,
            "model": model,
            "sources": sources,
            "confidence": "high" if ml_risk.get("available") else "medium",
        }
    except Exception as exc:
        logger.exception(
            "Vendor AI generation failed vendor_id=%s",
            vendor.id,
        )
        ai_payload = {
            "answer": (
                f"Live vendor snapshot for {vendor.name}: "
                f"outstanding {vendor.outstanding:.2f} INR, "
                f"overdue {vendor.overdue:.2f} INR, "
                f"and risk {vendor.risk}."
            ),
            "model": "cashguard-vendor-rule-engine",
            "sources": ["live_cashguard_context"],
            "confidence": "medium",
            "error": str(exc),
        }

    return VendorIntelligenceResponse(
        status="success",
        businessId=authorized_business_id,
        vendor=vendor,
        ai=ai_payload,
        generatedAt=datetime.utcnow().isoformat(),
    )
