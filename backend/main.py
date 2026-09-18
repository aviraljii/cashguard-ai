from __future__ import annotations

import logging
import uuid
from contextlib import asynccontextmanager
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse, Response

from database import check_database_connection

# ============================================================================
# LOGGING
# ============================================================================

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("cashguard.backend")


# ============================================================================
# AUTH DATABASE / SQLALCHEMY
# ============================================================================

from auth_service.database import Base, engine, get_db


# ============================================================================
# MODELS
# ============================================================================

from auth_service.models.user import User
from audit_service.models import AuditLog
from banking_service.models import BankAccount, BankTransaction, BankingWebhookEvent
from payment_service.models import Payment, PaymentWebhookEvent
from payment_service.models.reconciliation import PaymentReconciliation
from risk_service.models.risk_result import RiskResult
from alert_service.models import Alert
from notification_service.models import Notification
from paisa.models import BusinessMembership


# ============================================================================
# ROUTERS
# ============================================================================

from dashboard_service.routes import router as dashboard_router
from erp_service.routes.customer_routes import router as customer_router
from auth_service.routes.auth import get_authenticated_user, router as auth_router
from auth_service.routes.user_panel import get_business_profile, router as user_panel_router
from banking_service.routes import router as banking_router
from payment_service.routes import router as payment_router
from risk_service.routes import router as risk_router
from alert_service.routes import router as alert_router
from notification_service.routes import router as notification_router
from invoice_services.routes import router as invoice_router
from admin_service.routes import router as admin_router
from routes.ai_routes import router as ai_router
from routes.analytics_routes import router as analytics_router
from routes.paisa import router as paisa_router
from routes.vendor_routes import router as vendor_router
from services.invoice_intelligence import InvoiceIntelligenceService


# ============================================================================
# DATABASE INITIALIZATION
# ============================================================================


def _ensure_users_profile_columns(connection) -> None:
    """Ensure the optional User Panel profile columns exist."""

    required_columns = {
        "mobile": "VARCHAR(30) NULL",
        "job_title": "VARCHAR(100) NULL",
        "city": "VARCHAR(100) NULL",
        "state": "VARCHAR(100) NULL",
    }

    for column_name, column_definition in required_columns.items():
        exists = connection.scalar(
            text(
                """
                SELECT COUNT(*)
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'users'
                  AND COLUMN_NAME = :column_name
                """
            ),
            {"column_name": column_name},
        )

        if int(exists or 0) == 0:
            connection.execute(
                text(
                    f"ALTER TABLE users ADD COLUMN {column_name} {column_definition}"
                )
            )
            logger.info("Added missing users.%s column.", column_name)


def initialize_database() -> None:
    """Initialize SQLAlchemy tables and sync User Panel profile columns."""

    # Touch imported models so SQLAlchemy registers their metadata.
    _ = (
        User,
        AuditLog,
        BankAccount,
        BankTransaction,
        BankingWebhookEvent,
        Payment,
        PaymentWebhookEvent,
        PaymentReconciliation,
        RiskResult,
        Alert,
        Notification,
        BusinessMembership,
    )

    if engine.dialect.name != "mysql":
        Base.metadata.create_all(bind=engine)
        logger.info("SQLAlchemy schema initialization completed.")
        return

    with engine.begin() as connection:
        acquired = connection.scalar(
            text("SELECT GET_LOCK('cashguard_schema_init', 30)")
        )

        if acquired != 1:
            raise RuntimeError(
                "Timed out waiting for database schema initialization."
            )

        try:
            Base.metadata.create_all(bind=connection)
            _ensure_users_profile_columns(connection)
        finally:
            connection.execute(
                text("SELECT RELEASE_LOCK('cashguard_schema_init')")
            )

    logger.info("MySQL schema initialization completed.")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """FastAPI application lifespan; replaces deprecated on_event startup."""

    initialize_database()
    yield


# ============================================================================
# APPLICATION
# ============================================================================

app = FastAPI(
    title="CashGuard-AI API",
    version="1.5.0",
    description=(
        "CashGuard-AI backend API for invoice management, GST calculation, "
        "invoice payments, payment risk, collection intelligence, ERP operations, "
        "banking, reconciliation, risk intelligence, alerts, notifications, "
        "administration, ML and AI-powered business insights."
    ),
    lifespan=lifespan,
)


# ============================================================================
# CORS
# ============================================================================

ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://192.168.1.9:3000",
    "http://10.123.15.242:3000",
    "http://10.142.136.242:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID"],
    max_age=600,
)


# ============================================================================
# REQUEST ID MIDDLEWARE
# ============================================================================


class RequestIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        request.state.request_id = request_id

        try:
            response = await call_next(request)
        except Exception:
            logger.exception(
                "Unhandled request exception request_id=%s method=%s url=%s",
                request_id,
                request.method,
                request.url,
            )
            raise

        response.headers["X-Request-ID"] = request_id
        return response


app.add_middleware(RequestIdMiddleware)


# ============================================================================
# HTTP EXCEPTION HANDLER
# ============================================================================


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    request_id = getattr(request.state, "request_id", None)
    headers = dict(exc.headers or {})

    if request_id:
        headers["X-Request-ID"] = request_id

    return JSONResponse(
        status_code=exc.status_code,
        content={
            "status": "error",
            "message": str(exc.detail) if exc.detail is not None else "Request failed.",
            "detail": exc.detail,
            "request_id": request_id,
        },
        headers=headers,
    )


# ============================================================================
# VALIDATION ERROR HANDLER
# ============================================================================


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    request_id = getattr(request.state, "request_id", None)

    logger.warning(
        "Request validation failed request_id=%s method=%s url=%s errors=%s",
        request_id,
        request.method,
        request.url,
        exc.errors(),
    )

    headers: dict[str, str] = {}
    if request_id:
        headers["X-Request-ID"] = request_id

    return JSONResponse(
        status_code=422,
        content={
            "status": "error",
            "message": "Request validation failed.",
            "detail": exc.errors(),
            "request_id": request_id,
        },
        headers=headers,
    )


# ============================================================================
# GLOBAL EXCEPTION HANDLER
# ============================================================================


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    request_id = getattr(request.state, "request_id", None)

    logger.exception(
        "Unhandled application error request_id=%s method=%s url=%s",
        request_id,
        request.method,
        request.url,
    )

    headers: dict[str, str] = {}
    if request_id:
        headers["X-Request-ID"] = request_id

    return JSONResponse(
        status_code=500,
        content={
            "status": "error",
            "message": "Internal server error.",
            "detail": str(exc),
            "request_id": request_id,
        },
        headers=headers,
    )


# ============================================================================
# SERVICES
# ============================================================================

invoice_intelligence_service = InvoiceIntelligenceService()


# ============================================================================
# SERIALIZATION HELPERS
# ============================================================================


def serialize_value(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, uuid.UUID):
        return str(value)
    return value


def serialize_row(row: Any) -> dict[str, Any]:
    return {
        key: serialize_value(value)
        for key, value in row._mapping.items()
    }


# ============================================================================
# ROUTE REGISTRATION
# ============================================================================

app.include_router(customer_router)
app.include_router(dashboard_router, prefix="/api")
app.include_router(auth_router, prefix="/api")
app.include_router(user_panel_router, prefix="/api")
app.include_router(banking_router, prefix="/api")
app.include_router(payment_router, prefix="/api")
app.include_router(risk_router, prefix="/api")
app.include_router(alert_router, prefix="/api")
app.include_router(notification_router, prefix="/api")
app.include_router(admin_router, prefix="/api/admin", tags=["Admin"])
app.include_router(ai_router, prefix="/api")
app.include_router(analytics_router, prefix="/api")
app.include_router(paisa_router, prefix="/api")
app.include_router(vendor_router, prefix="/api")


# ============================================================================
# USER PANEL BUSINESS COMPATIBILITY
# ============================================================================


@app.get("/api/businesses/me", tags=["Businesses"])
def get_current_business_compatibility(
    current_user=Depends(get_authenticated_user),
    db=Depends(get_db),
) -> dict[str, Any]:
    return get_business_profile(current_user=current_user, db=db)


# ============================================================================
# INVOICE MARK AS PAID
# ============================================================================


@app.post("/api/invoices/{invoice_id}/pay", tags=["Invoices"])
def mark_invoice_paid(invoice_id: str) -> dict[str, Any]:
    normalized_invoice_id = invoice_id.strip() if invoice_id else ""

    if not normalized_invoice_id:
        raise HTTPException(status_code=400, detail="invoice_id is required.")

    payment_id = str(uuid.uuid4())

    try:
        with engine.begin() as connection:
            invoice_result = connection.execute(
                text(
                    """
                    SELECT id, invoice_number, total_amount, amount_paid, status
                    FROM invoices
                    WHERE (
                        CAST(id AS CHAR) = :invoice_id
                        OR invoice_number = :invoice_id
                    )
                    LIMIT 1
                    FOR UPDATE
                    """
                ),
                {"invoice_id": normalized_invoice_id},
            )

            invoice = invoice_result.fetchone()
            if invoice is None:
                raise HTTPException(
                    status_code=404,
                    detail="Invoice not found. Use a valid invoice ID or invoice number.",
                )

            invoice_data = invoice._mapping
            database_invoice_id = str(invoice_data["id"])
            invoice_number = invoice_data.get("invoice_number") or database_invoice_id

            total_amount = Decimal(str(invoice_data.get("total_amount") or 0))
            current_paid = Decimal(str(invoice_data.get("amount_paid") or 0))
            outstanding = total_amount - current_paid

            if outstanding < 0:
                outstanding = Decimal("0")

            if outstanding <= 0:
                return {
                    "status": "success",
                    "message": "Invoice is already fully paid.",
                    "invoice_id": database_invoice_id,
                    "invoice_number": str(invoice_number),
                    "amount_paid": float(current_paid),
                    "outstanding": 0.0,
                    "payment_id": None,
                }

            payment_reference = f"CG-PAY-{payment_id[:8].upper()}"

            connection.execute(
                text(
                    """
                    INSERT INTO invoice_payments (
                        id, invoice_id, payment_date, amount,
                        payment_method, reference_number, created_at
                    )
                    VALUES (
                        :id, :invoice_id, CURRENT_DATE, :amount,
                        :payment_method, :reference_number, NOW()
                    )
                    """
                ),
                {
                    "id": payment_id,
                    "invoice_id": database_invoice_id,
                    "amount": outstanding,
                    "payment_method": "manual",
                    "reference_number": payment_reference,
                },
            )

            updated_paid = current_paid + outstanding

            connection.execute(
                text(
                    """
                    UPDATE invoices
                    SET amount_paid = :amount_paid,
                        status = 'paid',
                        updated_at = NOW()
                    WHERE CAST(id AS CHAR) = :invoice_id
                    """
                ),
                {
                    "amount_paid": updated_paid,
                    "invoice_id": database_invoice_id,
                },
            )

        return {
            "status": "success",
            "message": "Invoice marked as paid successfully.",
            "invoice_id": database_invoice_id,
            "invoice_number": str(invoice_number),
            "payment_id": payment_id,
            "payment_amount": float(outstanding),
            "amount_paid": float(updated_paid),
            "outstanding": 0.0,
            "payment_method": "manual",
            "reference_number": payment_reference,
        }

    except HTTPException:
        raise
    except Exception as exc:
        logger.exception(
            "Failed to mark invoice as paid invoice=%s",
            normalized_invoice_id,
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to mark invoice as paid: {str(exc)}",
        ) from exc


# ============================================================================
# INVOICE ROUTER
# ============================================================================

app.include_router(invoice_router, prefix="/api")


# ============================================================================
# HEALTH
# ============================================================================


@app.get("/health", tags=["Health"])
def health() -> dict[str, object]:
    database_connected = check_database_connection()
    return {
        "status": "success" if database_connected else "degraded",
        "service": "CashGuard-AI API",
        "message": (
            "Backend and database are running."
            if database_connected
            else "Backend is running, but database is unavailable."
        ),
        "database": "connected" if database_connected else "disconnected",
    }


# ============================================================================
# ROOT
# ============================================================================


@app.get("/", tags=["Health"])
def root() -> dict[str, str]:
    return {
        "status": "success",
        "service": "CashGuard-AI API",
        "version": "1.5.0",
        "docs": "/docs",
        "health": "/health",
        "services_health": "/health/services",
        "admin": "/api/admin/summary",
        "ai": "/api/ai/chat",
        "ai_insights": "/api/ai/insights",
        "cash_flow_ai": "/api/ai/insight/cash-flow",
        "analytics_api": "/api/analytics/overview",
        "analytics_ai": "/api/analytics/ai/insight",
        "analytics_report": "/api/analytics/report",
        "paisa_ai": "/api/ai/paisa/chat",
        "invoice_api": "/api/invoices",
        "payments_api": "/api/payments",
        "banking_api": "/api/banking",
        "reconciliation_api": "/api/payments/reconciliation",
        "risk_api": "/api/risk",
        "alerts_api": "/api/alerts",
        "user_panel_api": "/api/auth",
        "business_api": "/api/businesses/me",
    }


# ============================================================================
# INVOICE INTELLIGENCE
# ============================================================================


@app.get("/api/invoices/{invoice_id}/intelligence", tags=["Invoice Intelligence"])
def get_invoice_intelligence(invoice_id: str) -> dict[str, Any]:
    normalized_id = invoice_id.strip() if invoice_id else ""

    if not normalized_id:
        raise HTTPException(status_code=400, detail="invoice_id is required.")

    try:
        intelligence = invoice_intelligence_service.build_intelligence(normalized_id)
        return {
            "status": "success",
            "invoice_id": normalized_id,
            "intelligence": intelligence,
        }
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception(
            "Invoice intelligence failed for invoice %s.",
            normalized_id,
        )
        raise HTTPException(
            status_code=500,
            detail="Failed to generate invoice intelligence.",
        ) from exc


# ============================================================================
# SERVICE HEALTH
# ============================================================================


@app.get("/health/services", tags=["Health"])
def service_health() -> dict[str, Any]:
    database_connected = check_database_connection()

    risk_routes = bool(getattr(risk_router, "routes", None))
    ai_routes = bool(getattr(ai_router, "routes", None))
    analytics_routes = bool(getattr(analytics_router, "routes", None))
    paisa_routes = bool(getattr(paisa_router, "routes", None))
    vendor_routes = bool(getattr(vendor_router, "routes", None))
    admin_routes = bool(getattr(admin_router, "routes", None))
    user_panel_routes = bool(getattr(user_panel_router, "routes", None))

    return {
        "status": "healthy" if database_connected else "degraded",
        "service": "CashGuard-AI API",
        "version": "1.5.0",
        "database": "connected" if database_connected else "disconnected",
        "modules": {
            "dashboard": True,
            "authentication": True,
            "user_panel": user_panel_routes,
            "business_profile": True,
            "banking": True,
            "payments": True,
            "reconciliation": True,
            "risk": risk_routes,
            "alerts": True,
            "notifications": True,
            "invoice_service": True,
            "invoice_create": True,
            "invoice_payments": True,
            "invoice_intelligence": True,
            "ai_chat": ai_routes,
            "ai_cash_flow_insight": ai_routes,
            "ai_insights": ai_routes,
            "analytics": analytics_routes,
            "paisa_ai": paisa_routes,
            "vendors": vendor_routes,
            "admin_control_centre": admin_routes,
        },
    }


# ============================================================================
# ADMIN ROUTE HEALTH
# ============================================================================


@app.get("/api/admin", tags=["Admin"])
def admin_root() -> dict[str, Any]:
    return {
        "status": "success",
        "service": "CashGuard-AI Admin Control Centre",
        "message": "Admin router is mounted.",
        "summary": "/api/admin/summary",
        "businesses": "/api/admin/businesses",
        "users": "/api/admin/users",
        "services": "/api/admin/services",
        "ai_status": "/api/admin/ai/status",
        "ai_models": "/api/admin/ai/models",
        "ai_insights": "/api/admin/ai/insights",
        "ml_status": "/api/admin/ml/status",
        "anomalies": "/api/admin/anomalies",
        "alerts": "/api/admin/alerts",
        "audit_logs": "/api/admin/audit-logs",
        "data_quality": "/api/admin/data-quality",
    }


# ============================================================================
# APPLICATION READY
# ============================================================================

logger.info("CashGuard-AI application routes registered successfully.")
logger.info("Admin Control Centre router registered at /api/admin.")
logger.info("User Panel router registered at /api/auth.")
logger.info("AI router registered at /api/ai.")
logger.info("Analytics router registered at /api/analytics.")
logger.info("Paisa AI router registered at /api/ai/paisa.")
logger.info("Vendor router registered at /api/vendors.")
