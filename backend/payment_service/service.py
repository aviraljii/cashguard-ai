from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from audit_service.service import log_audit_event

from payment_service.models import (
    Payment,
    PaymentWebhookEvent,
)

from payment_service.providers import (
    PaymentProvider,
)

from payment_service.schemas import (
    PaymentCreate,
)


# ==================================================================
# PAYMENT STATUS TRANSITIONS
# ==================================================================

TRANSITIONS: dict[str, set[str]] = {
    "pending": {
        "processing",
        "failed",
        "cancelled",
    },
    "processing": {
        "completed",
        "failed",
        "cancelled",
    },
    "completed": {
        "refunded",
    },
    "failed": {
        "pending",
    },
    "cancelled": set(),
    "refunded": set(),
}

SUPPORTED_STATUSES = frozenset(
    TRANSITIONS.keys()
)


# ==================================================================
# HELPERS
# ==================================================================


def _clean_string(value: Any) -> str:
    """
    Convert a value to a trimmed string.
    None becomes an empty string.
    """
    if value is None:
        return ""

    return str(value).strip()


def _normalize_currency(value: Any) -> str:
    """
    Normalize currency code.
    Defaults to INR.
    """
    currency = _clean_string(value).upper()

    if not currency:
        return "INR"

    if len(currency) != 3:
        raise ValueError(
            "Currency must be a 3-letter code."
        )

    return currency


def _normalize_status(value: Any) -> str:
    """
    Normalize payment status.
    """
    return _clean_string(value).lower()


def _normalize_user_id(value: Any) -> int:
    """
    Normalize and validate user ID.
    """
    try:
        user_id = int(
            str(value).strip()
        )
    except (
        TypeError,
        ValueError,
    ) as exc:
        raise ValueError(
            "user_id must be a valid integer."
        ) from exc

    if user_id <= 0:
        raise ValueError(
            "user_id must be greater than zero."
        )

    return user_id


def _normalize_idempotency_key(
    value: Any,
) -> str:
    """
    Normalize and validate Idempotency-Key.
    """
    key = _clean_string(value)

    if not key:
        raise ValueError(
            "Idempotency-Key is required."
        )

    if len(key) < 8:
        raise ValueError(
            "Idempotency-Key must contain at least 8 characters."
        )

    if len(key) > 255:
        raise ValueError(
            "Idempotency-Key cannot exceed 255 characters."
        )

    return key


def _safe_decimal(
    value: Any,
) -> Decimal:
    """
    Convert payment amount to Decimal.
    """
    if isinstance(value, Decimal):
        amount = value
    else:
        try:
            amount = Decimal(
                str(value).strip()
            )
        except (
            InvalidOperation,
            ValueError,
            TypeError,
            ArithmeticError,
        ) as exc:
            raise ValueError(
                "Invalid payment amount."
            ) from exc

    if amount <= Decimal("0"):
        raise ValueError(
            "Payment amount must be greater than zero."
        )

    return amount


def _safe_limit(
    value: Any,
    default: int = 50,
) -> int:
    """
    Normalize pagination limit.
    """
    try:
        limit = int(
            str(value).strip()
        )
    except (
        TypeError,
        ValueError,
    ):
        limit = default

    return max(
        1,
        min(
            limit,
            100,
        ),
    )


def _safe_offset(
    value: Any,
    default: int = 0,
) -> int:
    """
    Normalize pagination offset.
    """
    try:
        offset = int(
            str(value).strip()
        )
    except (
        TypeError,
        ValueError,
    ):
        offset = default

    return max(
        0,
        offset,
    )


def _audit_safely(
    db: Session,
    *,
    event_type: str,
    entity_type: str,
    actor_user_id: int | None = None,
    entity_id: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    """
    Audit logging is non-blocking.

    A logging failure must never break the main payment
    operation.
    """
    try:
        log_audit_event(
            db,
            event_type=event_type,
            entity_type=entity_type,
            actor_user_id=actor_user_id,
            entity_id=entity_id,
            metadata=metadata or {},
        )
    except Exception as exc:
        print(
            "[PAYMENT] Audit logging error:",
            repr(exc),
        )


# ==================================================================
# AUTOMATIC PAYMENT RISK
# ==================================================================


def _trigger_payment_risk(
    db: Session,
    payment: Payment,
) -> None:
    """
    Trigger payment-risk calculation without allowing
    risk failures to break the payment flow.
    """
    try:
        from risk_service.service import (
            calculate_payment_risk,
        )

        calculate_payment_risk(
            db,
            payment,
        )

    except Exception as exc:
        print(
            "[PAYMENT] Risk generation error:",
            repr(exc),
        )

        try:
            db.rollback()

            _audit_safely(
                db,
                event_type="risk_generation_failed",
                entity_type="payment",
                actor_user_id=getattr(
                    payment,
                    "user_id",
                    None,
                ),
                entity_id=getattr(
                    payment,
                    "id",
                    None,
                ),
                metadata={
                    "payment_id": getattr(
                        payment,
                        "id",
                        None,
                    ),
                    "error": str(exc),
                },
            )

        except Exception:
            pass


# ==================================================================
# CREATE PAYMENT
# ==================================================================


def create_payment(
    db: Session,
    user_id: int,
    payload: PaymentCreate,
    idempotency_key: str,
    provider: PaymentProvider,
) -> Payment:
    """
    Create a payment safely.

    Repeating the same user + idempotency key returns
    the original payment.
    """

    normalized_user_id = _normalize_user_id(
        user_id
    )

    if payload is None:
        raise ValueError(
            "Payment payload is required."
        )

    normalized_key = _normalize_idempotency_key(
        idempotency_key
    )

    if provider is None:
        raise ValueError(
            "Payment provider is required."
        )

    provider_name = _clean_string(
        getattr(
            provider,
            "name",
            "",
        )
    ).lower()

    if not provider_name:
        raise ValueError(
            "Payment provider name is required."
        )

    # --------------------------------------------------------------
    # EXISTING IDEMPOTENT PAYMENT
    # --------------------------------------------------------------

    try:
        existing = db.scalar(
            select(Payment).where(
                Payment.user_id
                == normalized_user_id,
                Payment.idempotency_key
                == normalized_key,
            )
        )

    except SQLAlchemyError as exc:
        print(
            "[PAYMENT] Idempotency lookup error:",
            repr(exc),
        )

        raise RuntimeError(
            "Failed to check existing payment."
        ) from exc

    if existing is not None:
        return existing

    # --------------------------------------------------------------
    # NORMALIZE PAYMENT DATA
    # --------------------------------------------------------------

    amount = _safe_decimal(
        payload.amount
    )

    currency = _normalize_currency(
        payload.currency
    )

    payment_method = _clean_string(
        payload.payment_method
    )

    if not payment_method:
        raise ValueError(
            "Payment method is required."
        )

    # --------------------------------------------------------------
    # PROVIDER CREATION
    # --------------------------------------------------------------

    try:
        external_id, reference = (
            provider.create_payment(
                str(amount),
                currency,
                normalized_key,
            )
        )

    except Exception as exc:
        print(
            "[PAYMENT] Provider creation error:",
            repr(exc),
        )

        raise RuntimeError(
            "Payment provider failed to create payment."
        ) from exc

    external_id = _clean_string(
        external_id
    )

    reference = _clean_string(
        reference
    )

    if not external_id:
        raise RuntimeError(
            "Payment provider did not return an external payment ID."
        )

    # --------------------------------------------------------------
    # PAYMENT MODEL
    # --------------------------------------------------------------

    payment = Payment(
        user_id=normalized_user_id,
        external_payment_id=external_id,
        provider=provider_name,
        provider_reference=(
            reference or None
        ),
        idempotency_key=normalized_key,
        currency=currency,
        status="pending",
        payment_metadata=(
            payload.metadata
            if payload.metadata is not None
            else {}
        ),
        customer_id=(
            payload.customer_id
            if payload.customer_id
            else None
        ),
        invoice_id=(
            payload.invoice_id
            if payload.invoice_id
            else None
        ),
        account_id=(
            payload.account_id
            if payload.account_id
            else None
        ),
        amount=amount,
        payment_method=payment_method,
    )

    # --------------------------------------------------------------
    # SAVE
    # --------------------------------------------------------------

    try:
        db.add(payment)
        db.commit()
        db.refresh(payment)

    except IntegrityError as exc:
        db.rollback()

        # Concurrent duplicate request.
        try:
            concurrent_payment = db.scalar(
                select(Payment).where(
                    Payment.user_id
                    == normalized_user_id,
                    Payment.idempotency_key
                    == normalized_key,
                )
            )

            if concurrent_payment is not None:
                return concurrent_payment

        except SQLAlchemyError:
            pass

        raise ValueError(
            "Payment idempotency or provider reference conflict."
        ) from exc

    except SQLAlchemyError as exc:
        db.rollback()

        print(
            "[PAYMENT] Payment database error:",
            repr(exc),
        )

        raise RuntimeError(
            "Failed to create payment."
        ) from exc

    # --------------------------------------------------------------
    # AUDIT
    # --------------------------------------------------------------

    _audit_safely(
        db,
        event_type="payment_created",
        entity_type="payment",
        actor_user_id=normalized_user_id,
        entity_id=payment.id,
        metadata={
            "provider": provider_name,
            "sandbox": (
                provider_name == "sandbox"
            ),
            "amount": float(amount),
            "currency": currency,
            "payment_method": payment_method,
        },
    )

    # --------------------------------------------------------------
    # RISK
    # --------------------------------------------------------------

    _trigger_payment_risk(
        db,
        payment,
    )

    return payment


# ==================================================================
# GET PAYMENT
# ==================================================================


def get_payment(
    db: Session,
    payment_id: str,
    user_id: int,
) -> Payment | None:
    """
    Return one payment belonging to the user.
    """

    cleaned_payment_id = _clean_string(
        payment_id
    )

    if not cleaned_payment_id:
        return None

    try:
        normalized_user_id = _normalize_user_id(
            user_id
        )
    except ValueError:
        return None

    try:
        return db.scalar(
            select(Payment).where(
                Payment.id
                == cleaned_payment_id,
                Payment.user_id
                == normalized_user_id,
            )
        )

    except SQLAlchemyError as exc:
        print(
            "[PAYMENT] Payment lookup error:",
            repr(exc),
        )

        raise RuntimeError(
            "Failed to load payment."
        ) from exc


# ==================================================================
# LIST PAYMENTS
# ==================================================================


def list_payments(
    db: Session,
    user_id: int,
    limit: int,
    offset: int,
) -> list[Payment]:
    """
    Return paginated payments for a user.
    """

    normalized_user_id = _normalize_user_id(
        user_id
    )

    safe_limit = _safe_limit(
        limit
    )

    safe_offset = _safe_offset(
        offset
    )

    statement = (
        select(Payment)
        .where(
            Payment.user_id
            == normalized_user_id
        )
        .order_by(
            Payment.created_at.desc()
        )
        .limit(
            safe_limit
        )
        .offset(
            safe_offset
        )
    )

    try:
        return list(
            db.scalars(
                statement
            ).all()
        )

    except SQLAlchemyError as exc:
        print(
            "[PAYMENT] Payment list error:",
            repr(exc),
        )

        raise RuntimeError(
            "Failed to load payments."
        ) from exc


# ==================================================================
# TRANSITION PAYMENT
# ==================================================================


def transition_payment(
    db: Session,
    payment: Payment,
    new_status: str,
    reason: str | None = None,
) -> Payment:
    """
    Safely transition a payment between supported states.
    """

    if payment is None:
        raise ValueError(
            "Payment is required."
        )

    current_status = _normalize_status(
        payment.status
    )

    target_status = _normalize_status(
        new_status
    )

    # --------------------------------------------------------------
    # VALIDATE CURRENT STATUS
    # --------------------------------------------------------------

    if current_status not in TRANSITIONS:
        raise ValueError(
            f"Unsupported current payment status: "
            f"{current_status}"
        )

    # --------------------------------------------------------------
    # SAME STATUS
    # --------------------------------------------------------------

    if target_status == current_status:
        return payment

    # --------------------------------------------------------------
    # VALIDATE TARGET
    # --------------------------------------------------------------

    if target_status not in SUPPORTED_STATUSES:
        raise ValueError(
            f"Unsupported payment status: "
            f"{target_status}"
        )

    if target_status not in TRANSITIONS.get(
        current_status,
        set(),
    ):
        raise ValueError(
            f"Invalid payment transition from "
            f"{current_status} to {target_status}"
        )

    # --------------------------------------------------------------
    # FAILURE REASON
    # --------------------------------------------------------------

    cleaned_reason = _clean_string(
        reason
    )

    if target_status == "failed":
        payment.failure_reason = (
            cleaned_reason or None
        )
    elif cleaned_reason:
        payment.failure_reason = (
            cleaned_reason
        )
    elif target_status in {
        "pending",
        "processing",
        "completed",
        "cancelled",
        "refunded",
    }:
        payment.failure_reason = None

    # --------------------------------------------------------------
    # STATUS
    # --------------------------------------------------------------

    payment.status = target_status

    now = datetime.now(
        timezone.utc
    )

    if target_status in {
        "completed",
        "refunded",
    }:
        payment.completed_at = now

    if target_status == "failed":
        payment.failed_at = now

    # --------------------------------------------------------------
    # SAVE
    # --------------------------------------------------------------

    try:
        db.commit()
        db.refresh(payment)

    except SQLAlchemyError as exc:
        db.rollback()

        print(
            "[PAYMENT] Status transition database error:",
            repr(exc),
        )

        raise RuntimeError(
            "Failed to update payment status."
        ) from exc

    # --------------------------------------------------------------
    # AUDIT
    # --------------------------------------------------------------

    event_type = {
        "pending": "payment_pending",
        "processing": "payment_processing",
        "completed": "payment_completed",
        "failed": "payment_failed",
        "cancelled": "payment_cancelled",
        "refunded": "payment_refunded",
    }.get(
        target_status,
        "payment_updated",
    )

    _audit_safely(
        db,
        event_type=event_type,
        entity_type="payment",
        actor_user_id=getattr(
            payment,
            "user_id",
            None,
        ),
        entity_id=getattr(
            payment,
            "id",
            None,
        ),
        metadata={
            "previous_status": current_status,
            "new_status": target_status,
            "failure_reason": (
                cleaned_reason or None
            ),
        },
    )

    # --------------------------------------------------------------
    # RISK
    # --------------------------------------------------------------

    _trigger_payment_risk(
        db,
        payment,
    )

    return payment


# ==================================================================
# PERSIST WEBHOOK
# ==================================================================


def persist_webhook(
    db: Session,
    provider: str,
    event_id: str,
    event_type: str,
    payload: dict[str, Any],
) -> PaymentWebhookEvent | None:
    """
    Persist a verified payment webhook.

    Returns:
        event object when newly stored
        None when duplicate
    """

    cleaned_provider = _clean_string(
        provider
    ).lower()

    cleaned_event_id = _clean_string(
        event_id
    )

    cleaned_event_type = _clean_string(
        event_type
    ).lower()

    if not cleaned_provider:
        raise ValueError(
            "Webhook provider is required."
        )

    if not cleaned_event_id:
        raise ValueError(
            "Webhook event_id is required."
        )

    if not cleaned_event_type:
        raise ValueError(
            "Webhook event_type is required."
        )

    if not isinstance(
        payload,
        dict,
    ):
        raise ValueError(
            "Webhook payload must be a valid object."
        )

    event = PaymentWebhookEvent(
        provider=cleaned_provider,
        external_event_id=cleaned_event_id,
        event_type=cleaned_event_type,
        payload=payload,
        status="verified",
    )

    try:
        db.add(event)
        db.commit()
        db.refresh(event)

    except IntegrityError:
        db.rollback()

        return None

    except SQLAlchemyError as exc:
        db.rollback()

        print(
            "[PAYMENT] Webhook database error:",
            repr(exc),
        )

        raise RuntimeError(
            "Failed to persist payment webhook."
        ) from exc

    _audit_safely(
        db,
        event_type="webhook_received",
        entity_type="payment_webhook",
        entity_id=event.id,
        metadata={
            "provider": cleaned_provider,
            "event_type": cleaned_event_type,
            "external_event_id": cleaned_event_id,
        },
    )

    return event


# ==================================================================
# PROCESS WEBHOOK
# ==================================================================


def process_webhook(
    db: Session,
    event: PaymentWebhookEvent,
) -> None:
    """
    Process a previously verified payment webhook.
    """

    if event is None:
        raise ValueError(
            "Webhook event is required."
        )

    payload = (
        event.payload
        if isinstance(
            event.payload,
            dict,
        )
        else {}
    )

    data = payload.get(
        "data",
        {},
    )

    if not isinstance(
        data,
        dict,
    ):
        data = {}

    external_id = _clean_string(
        data.get(
            "external_payment_id"
        )
    )

    event_type = _normalize_status(
        event.event_type
    )

    mapping = {
        "payment.processing": "processing",
        "payment.succeeded": "completed",
        "payment.completed": "completed",
        "payment.failed": "failed",
        "payment.refunded": "refunded",
        "payment.cancelled": "cancelled",
    }

    # --------------------------------------------------------------
    # VALIDATE EVENT
    # --------------------------------------------------------------

    if (
        event_type not in mapping
        or not external_id
    ):
        event.status = "failed"
        event.error = (
            "Unsupported event or missing "
            "external_payment_id."
        )

        try:
            db.commit()
        except SQLAlchemyError:
            db.rollback()

        return

    target_status = mapping[
        event_type
    ]

    # --------------------------------------------------------------
    # FIND PAYMENT
    # --------------------------------------------------------------

    try:
        payment = db.scalar(
            select(Payment).where(
                Payment.provider
                == _clean_string(
                    event.provider
                ).lower(),
                Payment.external_payment_id
                == external_id,
            )
        )

    except SQLAlchemyError as exc:
        db.rollback()

        print(
            "[PAYMENT] Webhook payment lookup error:",
            repr(exc),
        )

        raise RuntimeError(
            "Failed to find payment for webhook."
        ) from exc

    # --------------------------------------------------------------
    # PAYMENT NOT FOUND
    # --------------------------------------------------------------

    if payment is None:
        event.status = "failed"
        event.error = "Payment not found"

        try:
            db.commit()
        except SQLAlchemyError:
            db.rollback()

        return

    # --------------------------------------------------------------
    # APPLY PAYMENT STATUS
    # --------------------------------------------------------------

    try:
        transition_payment(
            db=db,
            payment=payment,
            new_status=target_status,
            reason=data.get(
                "failure_reason"
            ),
        )

    except ValueError as exc:
        event.status = "failed"
        event.error = str(exc)

        try:
            db.commit()
        except SQLAlchemyError:
            db.rollback()

        return

    except Exception as exc:
        event.status = "failed"
        event.error = (
            "Payment status update failed: "
            + str(exc)
        )

        try:
            db.commit()
        except SQLAlchemyError:
            db.rollback()

        raise

    # --------------------------------------------------------------
    # MARK WEBHOOK PROCESSED
    # --------------------------------------------------------------

    event.status = "processed"
    event.error = None
    event.processed_at = datetime.now(
        timezone.utc
    )

    try:
        db.commit()

    except SQLAlchemyError as exc:
        db.rollback()

        print(
            "[PAYMENT] Webhook processing commit error:",
            repr(exc),
        )

        raise RuntimeError(
            "Failed to finalize payment webhook processing."
        ) from exc

    # --------------------------------------------------------------
    # AUDIT
    # --------------------------------------------------------------

    _audit_safely(
        db,
        event_type="webhook_processed",
        entity_type="payment_webhook",
        entity_id=event.id,
        metadata={
            "provider": event.provider,
            "event_type": event.event_type,
            "external_payment_id": external_id,
            "payment_id": payment.id,
            "new_status": target_status,
        },
    )


# ==================================================================
# PAYMENT RETRY
# ==================================================================


def retry_payment(
    db: Session,
    payment: Payment,
) -> Payment:
    """
    Retry a failed payment.
    """

    if payment is None:
        raise ValueError(
            "Payment is required."
        )

    return transition_payment(
        db=db,
        payment=payment,
        new_status="pending",
    )


# ==================================================================
# PAYMENT CANCEL
# ==================================================================


def cancel_payment(
    db: Session,
    payment: Payment,
) -> Payment:
    """
    Cancel a pending or processing payment.
    """

    if payment is None:
        raise ValueError(
            "Payment is required."
        )

    return transition_payment(
        db=db,
        payment=payment,
        new_status="cancelled",
    )