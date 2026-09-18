from __future__ import annotations

import uuid

from datetime import (
    datetime,
    timezone,
)

from decimal import Decimal
from typing import Any

from sqlalchemy import (
    DateTime,
    ForeignKey,
    JSON,
    Numeric,
    String,
    UniqueConstraint,
)

from sqlalchemy.orm import (
    Mapped,
    mapped_column,
)

from auth_service.database import Base


# ==================================================================
# PAYMENT
# ==================================================================


class Payment(Base):
    """
    Payment record.

    Stores every payment initiated through CashGuard-AI,
    including provider information, amount, status,
    references and idempotency information.
    """

    __tablename__ = "payments"

    __table_args__ = (
        # ----------------------------------------------------------
        # One idempotent payment per user + key
        # ----------------------------------------------------------
        UniqueConstraint(
            "user_id",
            "idempotency_key",
            name="uq_payment_user_idempotency",
        ),

        # ----------------------------------------------------------
        # Provider must not create duplicate external payments
        # ----------------------------------------------------------
        UniqueConstraint(
            "provider",
            "external_payment_id",
            name="uq_payment_provider_external",
        ),
    )

    # --------------------------------------------------------------
    # Primary key
    # --------------------------------------------------------------

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(
            uuid.uuid4()
        ),
    )

    # --------------------------------------------------------------
    # User
    # --------------------------------------------------------------

    user_id: Mapped[int] = mapped_column(
        ForeignKey(
            "users.id",
            ondelete="CASCADE",
        ),
        index=True,
        nullable=False,
    )

    # --------------------------------------------------------------
    # Related business entities
    #
    # These remain application-level references.
    # We do not introduce foreign keys here because the current
    # project schema uses multiple business-domain services.
    # --------------------------------------------------------------

    customer_id: Mapped[str | None] = mapped_column(
        String(100),
        index=True,
        nullable=True,
    )

    invoice_id: Mapped[str | None] = mapped_column(
        String(100),
        index=True,
        nullable=True,
    )

    account_id: Mapped[str | None] = mapped_column(
        String(36),
        index=True,
        nullable=True,
    )

    # --------------------------------------------------------------
    # Provider information
    # --------------------------------------------------------------

    external_payment_id: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    provider: Mapped[str] = mapped_column(
        String(50),
        index=True,
        nullable=False,
    )

    provider_reference: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    # --------------------------------------------------------------
    # Payment amount
    # --------------------------------------------------------------

    amount: Mapped[Decimal] = mapped_column(
        Numeric(
            18,
            2,
        ),
        nullable=False,
    )

    currency: Mapped[str] = mapped_column(
        String(3),
        nullable=False,
        default="INR",
    )

    # --------------------------------------------------------------
    # Payment status
    # --------------------------------------------------------------

    status: Mapped[str] = mapped_column(
        String(20),
        index=True,
        nullable=False,
        default="pending",
    )

    # --------------------------------------------------------------
    # Payment method
    # --------------------------------------------------------------

    payment_method: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )

    # --------------------------------------------------------------
    # Failure information
    # --------------------------------------------------------------

    failure_reason: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
    )

    # --------------------------------------------------------------
    # Idempotency
    # --------------------------------------------------------------

    idempotency_key: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    # --------------------------------------------------------------
    # Provider/application metadata
    #
    # Database column is named `metadata`, while the Python
    # attribute is `payment_metadata` to avoid conflicts with
    # SQLAlchemy's Base.metadata.
    # --------------------------------------------------------------

    payment_metadata: Mapped[
        dict[str, Any] | None
    ] = mapped_column(
        "metadata",
        JSON,
        nullable=True,
    )

    # --------------------------------------------------------------
    # Timestamps
    # --------------------------------------------------------------

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(
            timezone.utc
        ),
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(
            timezone.utc
        ),
        onupdate=lambda: datetime.now(
            timezone.utc
        ),
    )

    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    failed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )


# ==================================================================
# PAYMENT WEBHOOK EVENT
# ==================================================================


class PaymentWebhookEvent(Base):
    """
    Stores verified payment-provider webhook events.

    A provider event is processed only once using the
    provider + external_event_id unique constraint.
    """

    __tablename__ = "payment_webhook_events"

    __table_args__ = (
        UniqueConstraint(
            "provider",
            "external_event_id",
            name="uq_payment_webhook_provider_event",
        ),
    )

    # --------------------------------------------------------------
    # Primary key
    # --------------------------------------------------------------

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(
            uuid.uuid4()
        ),
    )

    # --------------------------------------------------------------
    # Provider
    # --------------------------------------------------------------

    provider: Mapped[str] = mapped_column(
        String(50),
        index=True,
        nullable=False,
    )

    # --------------------------------------------------------------
    # External event ID
    # --------------------------------------------------------------

    external_event_id: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    # --------------------------------------------------------------
    # Event type
    # --------------------------------------------------------------

    event_type: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    # --------------------------------------------------------------
    # Processing status
    #
    # Expected examples:
    #   received
    #   verified
    #   processed
    #   failed
    # --------------------------------------------------------------

    status: Mapped[str] = mapped_column(
        String(20),
        index=True,
        nullable=False,
        default="received",
    )

    # --------------------------------------------------------------
    # Original provider payload
    # --------------------------------------------------------------

    payload: Mapped[
        dict[str, Any]
    ] = mapped_column(
        JSON,
        nullable=False,
    )

    # --------------------------------------------------------------
    # Processing error
    # --------------------------------------------------------------

    error: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
    )

    # --------------------------------------------------------------
    # Timestamps
    # --------------------------------------------------------------

    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(
            timezone.utc
        ),
    )

    processed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )