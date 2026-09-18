from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    Date,
    DateTime,
    ForeignKey,
    JSON,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from auth_service.database import Base

# Ensure User model is registered in the same SQLAlchemy metadata
# before foreign-key dependent models are created.
from auth_service.models.user import User  # noqa: F401


# ==================================================================
# BANK ACCOUNT
# ==================================================================


class BankAccount(Base):
    __tablename__ = "bank_accounts"

    __table_args__ = (
        UniqueConstraint(
            "provider",
            "external_account_id",
            name="uq_bank_account_provider_external",
        ),
    )

    # --------------------------------------------------------------
    # Primary key
    # --------------------------------------------------------------

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )

    # --------------------------------------------------------------
    # Owner
    # --------------------------------------------------------------

    user_id: Mapped[int] = mapped_column(
        ForeignKey(
            "users.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    # --------------------------------------------------------------
    # Provider information
    # --------------------------------------------------------------

    provider: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        index=True,
    )

    external_account_id: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    currency: Mapped[str] = mapped_column(
        String(3),
        nullable=False,
        default="INR",
    )

    # --------------------------------------------------------------
    # Balance
    # --------------------------------------------------------------

    balance: Mapped[Decimal | None] = mapped_column(
        Numeric(18, 2),
        nullable=True,
    )

    # --------------------------------------------------------------
    # Synchronization
    # --------------------------------------------------------------

    sync_status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="never_synced",
    )

    last_synced_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # --------------------------------------------------------------
    # Timestamps
    # --------------------------------------------------------------

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


# ==================================================================
# BANK TRANSACTION
#
# Must remain aligned with the EXISTING bank_transactions table.
#
# Existing fields:
#   id
#   business_id
#   transaction_date
#   transaction_type
#   category
#   amount
#   running_balance
#   description
#   reference_number
#   customer_id
#   supplier_id
#   invoice_payment_id
#   expense_id
#   created_at
#
# IMPORTANT:
#   Do NOT add account_id here.
# ==================================================================


class BankTransaction(Base):
    __tablename__ = "bank_transactions"

    # --------------------------------------------------------------
    # Primary key
    # --------------------------------------------------------------

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )

    # --------------------------------------------------------------
    # Business
    # --------------------------------------------------------------

    business_id: Mapped[str] = mapped_column(
        String(36),
        nullable=False,
        index=True,
    )

    # --------------------------------------------------------------
    # Transaction date
    # --------------------------------------------------------------

    transaction_date: Mapped[date] = mapped_column(
        Date,
        nullable=False,
        index=True,
    )

    # --------------------------------------------------------------
    # Transaction type
    # --------------------------------------------------------------

    transaction_type: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
    )

    # --------------------------------------------------------------
    # Category
    # --------------------------------------------------------------

    category: Mapped[str] = mapped_column(
        String(80),
        nullable=False,
    )

    # --------------------------------------------------------------
    # Amount
    # --------------------------------------------------------------

    amount: Mapped[Decimal] = mapped_column(
        Numeric(14, 2),
        nullable=False,
    )

    # --------------------------------------------------------------
    # Running balance
    # --------------------------------------------------------------

    running_balance: Mapped[Decimal] = mapped_column(
        Numeric(14, 2),
        nullable=False,
    )

    # --------------------------------------------------------------
    # Description
    # --------------------------------------------------------------

    description: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    # --------------------------------------------------------------
    # Reference number
    # --------------------------------------------------------------

    reference_number: Mapped[str | None] = mapped_column(
        String(80),
        nullable=True,
    )

    # --------------------------------------------------------------
    # Optional customer ID
    # --------------------------------------------------------------

    customer_id: Mapped[str | None] = mapped_column(
        String(36),
        nullable=True,
        index=True,
    )

    # --------------------------------------------------------------
    # Optional supplier ID
    # --------------------------------------------------------------

    supplier_id: Mapped[str | None] = mapped_column(
        String(36),
        nullable=True,
        index=True,
    )

    # --------------------------------------------------------------
    # Optional invoice payment ID
    # --------------------------------------------------------------

    invoice_payment_id: Mapped[str | None] = mapped_column(
        String(36),
        nullable=True,
        index=True,
    )

    # --------------------------------------------------------------
    # Optional expense ID
    # --------------------------------------------------------------

    expense_id: Mapped[str | None] = mapped_column(
        String(36),
        nullable=True,
        index=True,
    )

    # --------------------------------------------------------------
    # Created timestamp
    # --------------------------------------------------------------

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )


# ==================================================================
# BANKING WEBHOOK EVENT
# ==================================================================


class BankingWebhookEvent(Base):
    __tablename__ = "banking_webhook_events"

    __table_args__ = (
        UniqueConstraint(
            "provider",
            "external_event_id",
            name="uq_banking_webhook_provider_event",
        ),
    )

    # --------------------------------------------------------------
    # Primary key
    # --------------------------------------------------------------

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )

    # --------------------------------------------------------------
    # Provider
    # --------------------------------------------------------------

    provider: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        index=True,
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
    # Raw webhook payload
    # --------------------------------------------------------------

    payload: Mapped[dict[str, Any]] = mapped_column(
        JSON,
        nullable=False,
    )

    # --------------------------------------------------------------
    # Received timestamp
    # --------------------------------------------------------------

    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )