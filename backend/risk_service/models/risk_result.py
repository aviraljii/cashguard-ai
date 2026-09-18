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


class RiskResult(Base):
    """
    Stores the risk prediction generated for a payment.

    One payment can have multiple risk results only when the
    model_version is different. This allows historical results from
    different model versions while preventing duplicate results for
    the same payment + model version.
    """

    __tablename__ = "risk_results"

    __table_args__ = (
        UniqueConstraint(
            "payment_id",
            "model_version",
            name="uq_risk_payment_model_version",
        ),
    )

    # ------------------------------------------------------------------
    # PRIMARY KEY
    # ------------------------------------------------------------------

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )

    # ------------------------------------------------------------------
    # PAYMENT REFERENCE
    # ------------------------------------------------------------------

    payment_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey(
            "payments.id",
        ),
        nullable=False,
        index=True,
    )

    # ------------------------------------------------------------------
    # USER REFERENCE
    # ------------------------------------------------------------------

    user_id: Mapped[int] = mapped_column(
        ForeignKey(
            "users.id",
        ),
        nullable=False,
        index=True,
    )

    # ------------------------------------------------------------------
    # RISK SCORE
    # ------------------------------------------------------------------

    risk_score: Mapped[Decimal] = mapped_column(
        Numeric(
            precision=6,
            scale=2,
        ),
        nullable=False,
        default=Decimal("0.00"),
    )

    # ------------------------------------------------------------------
    # RISK LEVEL
    # ------------------------------------------------------------------

    risk_level: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="LOW",
        index=True,
    )

    # ------------------------------------------------------------------
    # MODEL PROBABILITY
    # ------------------------------------------------------------------

    probability: Mapped[Decimal | None] = mapped_column(
        Numeric(
            precision=6,
            scale=5,
        ),
        nullable=True,
    )

    # ------------------------------------------------------------------
    # MODEL VERSION
    # ------------------------------------------------------------------

    model_version: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    # ------------------------------------------------------------------
    # PREDICTION SOURCE
    # ------------------------------------------------------------------

    prediction_source: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="rules",
    )

    # ------------------------------------------------------------------
    # FEATURES
    # ------------------------------------------------------------------

    features: Mapped[dict[str, Any] | None] = mapped_column(
        JSON,
        nullable=True,
    )

    # ------------------------------------------------------------------
    # RISK SIGNALS
    # ------------------------------------------------------------------

    signals: Mapped[list[str] | None] = mapped_column(
        JSON,
        nullable=True,
    )

    # ------------------------------------------------------------------
    # CREATED TIMESTAMP
    # ------------------------------------------------------------------

    created_at: Mapped[datetime] = mapped_column(
        DateTime(
            timezone=True,
        ),
        nullable=False,
        default=lambda: datetime.now(
            timezone.utc
        ),
    )

    # ------------------------------------------------------------------
    # UPDATED TIMESTAMP
    # ------------------------------------------------------------------

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(
            timezone=True,
        ),
        nullable=False,
        default=lambda: datetime.now(
            timezone.utc
        ),
        onupdate=lambda: datetime.now(
            timezone.utc
        ),
    )