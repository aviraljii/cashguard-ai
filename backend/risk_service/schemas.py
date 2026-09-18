from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
)


# ============================================================================
# RISK RESULT RESPONSE
# ============================================================================

class RiskResultResponse(
    BaseModel
):
    """
    API response representing one payment risk result.
    """

    id: str

    payment_id: str

    user_id: int

    risk_score: Decimal = Field(
        ge=Decimal("0"),
        le=Decimal("100"),
    )

    risk_level: str

    probability: Decimal | None = Field(
        default=None,
        ge=Decimal("0"),
        le=Decimal("1"),
    )

    model_version: str

    prediction_source: str

    features: dict[str, Any] | None = None

    signals: list[str] | None = None

    created_at: datetime

    updated_at: datetime

    model_config = ConfigDict(
        from_attributes=True,
    )


# ============================================================================
# RISK RESULT LIST RESPONSE
# ============================================================================

class RiskResultListResponse(
    BaseModel
):
    """
    Paginated list response for payment risk results.
    """

    items: list[
        RiskResultResponse
    ] = Field(
        default_factory=list,
    )

    total: int = Field(
        default=0,
        ge=0,
    )

    limit: int = Field(
        default=50,
        ge=1,
        le=100,
    )

    offset: int = Field(
        default=0,
        ge=0,
    )

    model_config = ConfigDict(
        from_attributes=True,
    )