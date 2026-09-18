from __future__ import annotations

from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field


RiskSegment = Literal[
    "low",
    "moderate",
    "high",
]

CustomerStatus = Literal[
    "active",
    "inactive",
]


class CustomerBase(BaseModel):
    """
    Common customer fields used by create/update operations.
    """

    business_id: str = Field(
        min_length=1,
        max_length=36,
    )

    customer_code: str = Field(
        min_length=1,
        max_length=30,
    )

    name: str = Field(
        min_length=1,
        max_length=200,
    )

    phone: str | None = Field(
        default=None,
        max_length=20,
    )

    email: EmailStr | None = None

    city: str | None = Field(
        default=None,
        max_length=100,
    )

    state: str | None = Field(
        default=None,
        max_length=100,
    )

    credit_limit: Decimal = Field(
        default=Decimal("0.00"),
        ge=Decimal("0.00"),
    )

    payment_terms_days: int = Field(
        default=30,
        ge=0,
    )

    risk_segment: RiskSegment = "moderate"

    status: CustomerStatus = "active"


class CustomerCreate(CustomerBase):
    """
    Payload for creating a customer.
    """

    pass


class CustomerUpdate(BaseModel):
    """
    Partial payload for updating a customer.
    """

    model_config = ConfigDict(
        extra="forbid",
    )

    customer_code: str | None = Field(
        default=None,
        min_length=1,
        max_length=30,
    )

    name: str | None = Field(
        default=None,
        min_length=1,
        max_length=200,
    )

    phone: str | None = Field(
        default=None,
        max_length=20,
    )

    email: EmailStr | None = None

    city: str | None = Field(
        default=None,
        max_length=100,
    )

    state: str | None = Field(
        default=None,
        max_length=100,
    )

    credit_limit: Decimal | None = Field(
        default=None,
        ge=Decimal("0.00"),
    )

    payment_terms_days: int | None = Field(
        default=None,
        ge=0,
    )

    risk_segment: RiskSegment | None = None

    status: CustomerStatus | None = None


class CustomerResponse(CustomerBase):
    """
    Customer returned by the backend API.
    """

    model_config = ConfigDict(
        from_attributes=True,
    )

    id: str

    created_at: str

    updated_at: str