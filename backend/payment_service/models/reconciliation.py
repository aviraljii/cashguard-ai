from __future__ import annotations

import uuid

from datetime import datetime, timezone
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
from sqlalchemy.orm import Mapped, mapped_column

from auth_service.database import Base


# ==================================================================
# PAYMENT RECONCILIATION
# ==================================================================


class PaymentReconciliation(Base):
    """
    Stores the relationship between a CashGuard payment and
    a banking transaction.

    Important:
    - Uses the existing payments table.
    - Uses the existing bank_transactions table.
    - Does NOT require account_id/currency/source fields
      on bank_transactions.
    """

    __tablename__ = "payment_reconciliations"

    __table_args__ = (
        UniqueConstraint(
            "payment_id",
            "bank_transaction_id",
            name="uq_reconciliation_payment_transaction",
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
    # Payment relationship
    # --------------------------------------------------------------

    payment_id: Mapped[str] = mapped_column(
        ForeignKey(
            "payments.id",
            ondelete="CASCADE",
        ),
        index=True,
        nullable=False,
    )

    # --------------------------------------------------------------
    # Banking transaction relationship
    # --------------------------------------------------------------

    bank_transaction_id: Mapped[str] = mapped_column(
        ForeignKey(
            "bank_transactions.id",
            ondelete="CASCADE",
        ),
        index=True,
        nullable=False,
    )

    # --------------------------------------------------------------
    # Reconciliation status
    # --------------------------------------------------------------

    status: Mapped[str] = mapped_column(
        String(30),
        index=True,
        nullable=False,
        default="unmatched",
    )

    # --------------------------------------------------------------
    # Amount matched
    # --------------------------------------------------------------

    matched_amount: Mapped[Decimal] = mapped_column(
        Numeric(18, 2),
        nullable=False,
        default=Decimal("0.00"),
    )

    # --------------------------------------------------------------
    # Original payment amount
    # --------------------------------------------------------------

    payment_amount: Mapped[Decimal] = mapped_column(
        Numeric(18, 2),
        nullable=False,
        default=Decimal("0.00"),
    )

    # --------------------------------------------------------------
    # Bank transaction amount
    # --------------------------------------------------------------

    transaction_amount: Mapped[Decimal] = mapped_column(
        Numeric(18, 2),
        nullable=False,
        default=Decimal("0.00"),
    )

    # --------------------------------------------------------------
    # Payment currency
    #
    # The currency is stored from Payment because the existing
    # bank_transactions table does not contain a currency column.
    # --------------------------------------------------------------

    currency: Mapped[str] = mapped_column(
        String(3),
        nullable=False,
        default="INR",
    )

    # --------------------------------------------------------------
    # Match score
    # --------------------------------------------------------------

    match_score: Mapped[Decimal | None] = mapped_column(
        Numeric(5, 2),
        nullable=True,
    )

    # --------------------------------------------------------------
    # Human-readable explanation
    # --------------------------------------------------------------

    match_reason: Mapped[str | None] = mapped_column(
        String(1000),
        nullable=True,
    )

    # --------------------------------------------------------------
    # Additional reconciliation metadata
    # --------------------------------------------------------------

    reconciliation_metadata: Mapped[
        dict[str, Any] | None
    ] = mapped_column(
        "metadata",
        JSON,
        nullable=True,
    )

    # --------------------------------------------------------------
    # Created timestamp
    # --------------------------------------------------------------

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    # --------------------------------------------------------------
    # Updated timestamp
    # --------------------------------------------------------------

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )