from __future__ import annotations

from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Any, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
)


# ==================================================================
# PAYMENT STATUS
# ==================================================================

PaymentStatus = Literal[
    "pending",
    "processing",
    "completed",
    "failed",
    "cancelled",
    "refunded",
]


# ==================================================================
# RECONCILIATION STATUS
# ==================================================================

ReconciliationStatus = Literal[
    "matched",
    "partially_matched",
    "unmatched",
    "duplicate",
    "exception",
]


# ==================================================================
# COMMON HELPERS
# ==================================================================

def _clean_optional_string(
    value: Any,
) -> str | None:
    """
    Normalize an optional string.

    Empty strings become None.
    """

    if value is None:
        return None

    cleaned = str(value).strip()

    return cleaned or None


def _clean_required_string(
    value: Any,
    field_name: str,
) -> str:
    """
    Normalize a required string.
    """

    cleaned = str(value or "").strip()

    if not cleaned:
        raise ValueError(
            f"{field_name} cannot be empty."
        )

    return cleaned


def _normalize_currency(
    value: Any,
) -> str:
    """
    Normalize a 3-letter currency code.
    """

    currency = str(
        value or "INR"
    ).strip().upper()

    if len(currency) != 3:
        raise ValueError(
            "currency must be a 3-letter currency code."
        )

    if not currency.isalpha():
        raise ValueError(
            "currency must contain only letters."
        )

    return currency


def _normalize_decimal(
    value: Any,
    field_name: str,
) -> Decimal:
    """
    Safely normalize a Decimal value.
    """

    if value is None:
        raise ValueError(
            f"{field_name} cannot be null."
        )

    if isinstance(value, Decimal):
        return value

    try:
        return Decimal(
            str(value).strip()
        )
    except (
        InvalidOperation,
        ValueError,
        TypeError,
        ArithmeticError,
    ) as exc:
        raise ValueError(
            f"{field_name} must be a valid decimal value."
        ) from exc


# ==================================================================
# PAYMENT CREATE
# ==================================================================

class PaymentCreate(BaseModel):
    """
    Request schema for creating a payment.
    """

    customer_id: str | None = Field(
        default=None,
        max_length=100,
        description="Optional customer identifier.",
    )

    invoice_id: str | None = Field(
        default=None,
        max_length=100,
        description="Optional invoice identifier.",
    )

    account_id: str | None = Field(
        default=None,
        max_length=36,
        description="Optional bank/payment account identifier.",
    )

    amount: Decimal = Field(
        ...,
        gt=0,
        max_digits=18,
        decimal_places=2,
        description="Payment amount.",
    )

    currency: str = Field(
        default="INR",
        min_length=3,
        max_length=3,
        description="Payment currency.",
    )

    payment_method: str = Field(
        ...,
        min_length=2,
        max_length=50,
        description="Payment method.",
    )

    provider: str = Field(
        default="sandbox",
        min_length=2,
        max_length=50,
        description="Payment provider.",
    )

    metadata: dict[str, Any] | None = Field(
        default=None,
        description="Optional provider/application metadata.",
    )

    model_config = ConfigDict(
        extra="ignore",
    )

    # --------------------------------------------------------------
    # CUSTOMER ID
    # --------------------------------------------------------------

    @field_validator(
        "customer_id",
        "invoice_id",
        "account_id",
        mode="before",
    )
    @classmethod
    def normalize_optional_ids(
        cls,
        value,
    ) -> str | None:
        return _clean_optional_string(
            value
        )

    # --------------------------------------------------------------
    # PAYMENT METHOD
    # --------------------------------------------------------------

    @field_validator(
        "payment_method",
        mode="before",
    )
    @classmethod
    def normalize_payment_method(
        cls,
        value,
    ) -> str:
        return _clean_required_string(
            value,
            "payment_method",
        ).lower()

    # --------------------------------------------------------------
    # PROVIDER
    # --------------------------------------------------------------

    @field_validator(
        "provider",
        mode="before",
    )
    @classmethod
    def normalize_provider(
        cls,
        value,
    ) -> str:
        provider = _clean_required_string(
            value or "sandbox",
            "provider",
        )

        return provider.lower()

    # --------------------------------------------------------------
    # CURRENCY
    # --------------------------------------------------------------

    @field_validator(
        "currency",
        mode="before",
    )
    @classmethod
    def normalize_payment_currency(
        cls,
        value,
    ) -> str:
        return _normalize_currency(
            value
        )

    # --------------------------------------------------------------
    # AMOUNT
    # --------------------------------------------------------------

    @field_validator(
        "amount",
        mode="before",
    )
    @classmethod
    def normalize_payment_amount(
        cls,
        value,
    ) -> Decimal:
        amount = _normalize_decimal(
            value,
            "amount",
        )

        if amount <= 0:
            raise ValueError(
                "amount must be greater than zero."
            )

        return amount

    # --------------------------------------------------------------
    # METADATA
    # --------------------------------------------------------------

    @field_validator(
        "metadata",
        mode="before",
    )
    @classmethod
    def normalize_metadata(
        cls,
        value,
    ) -> dict[str, Any] | None:
        if value is None:
            return None

        if not isinstance(
            value,
            dict,
        ):
            raise ValueError(
                "metadata must be a valid object."
            )

        return value


# ==================================================================
# PAYMENT UPDATE
# ==================================================================

class PaymentUpdate(BaseModel):
    """
    Request schema for updating a payment.
    """

    status: PaymentStatus | None = Field(
        default=None,
        description="New payment status.",
    )

    failure_reason: str | None = Field(
        default=None,
        max_length=500,
        description="Failure reason when payment fails.",
    )

    model_config = ConfigDict(
        extra="ignore",
    )

    # --------------------------------------------------------------
    # FAILURE REASON
    # --------------------------------------------------------------

    @field_validator(
        "failure_reason",
        mode="before",
    )
    @classmethod
    def normalize_failure_reason(
        cls,
        value,
    ) -> str | None:
        return _clean_optional_string(
            value
        )


# ==================================================================
# PAYMENT RESPONSE
# ==================================================================

class PaymentResponse(BaseModel):
    """
    Payment API response.
    """

    id: str

    user_id: int

    customer_id: str | None

    invoice_id: str | None

    account_id: str | None

    external_payment_id: str

    provider: str

    amount: Decimal

    currency: str

    status: PaymentStatus

    payment_method: str

    failure_reason: str | None

    provider_reference: str | None

    idempotency_key: str

    payment_metadata: dict[str, Any] | None

    created_at: datetime

    updated_at: datetime

    completed_at: datetime | None

    failed_at: datetime | None

    model_config = ConfigDict(
        from_attributes=True,
    )

    # --------------------------------------------------------------
    # STRING NORMALIZATION
    # --------------------------------------------------------------

    @field_validator(
        "id",
        "external_payment_id",
        "provider",
        "currency",
        "payment_method",
        "idempotency_key",
        mode="before",
    )
    @classmethod
    def normalize_required_response_strings(
        cls,
        value,
    ) -> str:
        return _clean_required_string(
            value,
            "Payment response field",
        )

    # --------------------------------------------------------------
    # OPTIONAL STRINGS
    # --------------------------------------------------------------

    @field_validator(
        "customer_id",
        "invoice_id",
        "account_id",
        "failure_reason",
        "provider_reference",
        mode="before",
    )
    @classmethod
    def normalize_optional_response_strings(
        cls,
        value,
    ) -> str | None:
        return _clean_optional_string(
            value
        )

    # --------------------------------------------------------------
    # CURRENCY
    # --------------------------------------------------------------

    @field_validator(
        "currency",
        mode="before",
    )
    @classmethod
    def normalize_response_currency(
        cls,
        value,
    ) -> str:
        return _normalize_currency(
            value
        )

    # --------------------------------------------------------------
    # AMOUNT
    # --------------------------------------------------------------

    @field_validator(
        "amount",
        mode="before",
    )
    @classmethod
    def normalize_response_amount(
        cls,
        value,
    ) -> Decimal:
        return _normalize_decimal(
            value,
            "amount",
        )

    # --------------------------------------------------------------
    # METADATA
    # --------------------------------------------------------------

    @field_validator(
        "payment_metadata",
        mode="before",
    )
    @classmethod
    def normalize_response_metadata(
        cls,
        value,
    ) -> dict[str, Any] | None:
        if value is None:
            return None

        if not isinstance(
            value,
            dict,
        ):
            return None

        return value


# ==================================================================
# WEBHOOK RESPONSE
# ==================================================================

class WebhookResponse(BaseModel):
    """
    Generic webhook response.
    """

    accepted: bool

    duplicate: bool = False

    message: str = Field(
        ...,
        min_length=1,
        max_length=500,
    )

    model_config = ConfigDict(
        extra="ignore",
    )

    @field_validator(
        "message",
        mode="before",
    )
    @classmethod
    def normalize_message(
        cls,
        value,
    ) -> str:
        return _clean_required_string(
            value,
            "message",
        )


# ==================================================================
# RECONCILIATION RESPONSE
# ==================================================================

class ReconciliationResponse(BaseModel):
    """
    Payment-to-bank reconciliation response.
    """

    id: str

    payment_id: str

    bank_transaction_id: str

    status: ReconciliationStatus

    matched_amount: Decimal

    payment_amount: Decimal

    transaction_amount: Decimal

    currency: str

    match_score: Decimal | None

    match_reason: str | None

    reconciliation_metadata: dict[str, Any] | None

    created_at: datetime

    updated_at: datetime

    model_config = ConfigDict(
        from_attributes=True,
    )

    # --------------------------------------------------------------
    # REQUIRED STRINGS
    # --------------------------------------------------------------

    @field_validator(
        "id",
        "payment_id",
        "bank_transaction_id",
        mode="before",
    )
    @classmethod
    def normalize_reconciliation_ids(
        cls,
        value,
    ) -> str:
        return _clean_required_string(
            value,
            "reconciliation identifier",
        )

    # --------------------------------------------------------------
    # CURRENCY
    # --------------------------------------------------------------

    @field_validator(
        "currency",
        mode="before",
    )
    @classmethod
    def normalize_reconciliation_currency(
        cls,
        value,
    ) -> str:
        return _normalize_currency(
            value
        )

    # --------------------------------------------------------------
    # MONEY
    # --------------------------------------------------------------

    @field_validator(
        "matched_amount",
        "payment_amount",
        "transaction_amount",
        mode="before",
    )
    @classmethod
    def normalize_reconciliation_money(
        cls,
        value,
    ) -> Decimal:
        return _normalize_decimal(
            value,
            "reconciliation amount",
        )

    # --------------------------------------------------------------
    # MATCH SCORE
    # --------------------------------------------------------------

    @field_validator(
        "match_score",
        mode="before",
    )
    @classmethod
    def normalize_match_score(
        cls,
        value,
    ) -> Decimal | None:
        if value is None:
            return None

        score = _normalize_decimal(
            value,
            "match_score",
        )

        if score < 0:
            return Decimal("0")

        if score > 100:
            return Decimal("100")

        return score

    # --------------------------------------------------------------
    # MATCH REASON
    # --------------------------------------------------------------

    @field_validator(
        "match_reason",
        mode="before",
    )
    @classmethod
    def normalize_match_reason(
        cls,
        value,
    ) -> str | None:
        return _clean_optional_string(
            value
        )

    # --------------------------------------------------------------
    # METADATA
    # --------------------------------------------------------------

    @field_validator(
        "reconciliation_metadata",
        mode="before",
    )
    @classmethod
    def normalize_reconciliation_metadata(
        cls,
        value,
    ) -> dict[str, Any] | None:
        if value is None:
            return None

        if not isinstance(
            value,
            dict,
        ):
            return None

        return value


# ==================================================================
# RECONCILIATION LIST RESPONSE
# ==================================================================

class ReconciliationListResponse(BaseModel):
    """
    Paginated reconciliation response.
    """

    items: list[ReconciliationResponse]

    total: int = Field(
        ge=0,
    )

    limit: int = Field(
        ge=1,
        le=100,
    )

    offset: int = Field(
        ge=0,
    )

    model_config = ConfigDict(
        from_attributes=True,
    )

    # --------------------------------------------------------------
    # TOTAL
    # --------------------------------------------------------------

    @field_validator(
        "total",
        mode="before",
    )
    @classmethod
    def normalize_total(
        cls,
        value,
    ) -> int:
        try:
            total = int(
                str(value).strip()
            )
        except (
            TypeError,
            ValueError,
        ) as exc:
            raise ValueError(
                "total must be an integer."
            ) from exc

        if total < 0:
            raise ValueError(
                "total cannot be negative."
            )

        return total

    # --------------------------------------------------------------
    # LIMIT
    # --------------------------------------------------------------

    @field_validator(
        "limit",
        mode="before",
    )
    @classmethod
    def normalize_limit(
        cls,
        value,
    ) -> int:
        try:
            limit = int(
                str(value).strip()
            )
        except (
            TypeError,
            ValueError,
        ) as exc:
            raise ValueError(
                "limit must be an integer."
            ) from exc

        if not 1 <= limit <= 100:
            raise ValueError(
                "limit must be between 1 and 100."
            )

        return limit

    # --------------------------------------------------------------
    # OFFSET
    # --------------------------------------------------------------

    @field_validator(
        "offset",
        mode="before",
    )
    @classmethod
    def normalize_offset(
        cls,
        value,
    ) -> int:
        try:
            offset = int(
                str(value).strip()
            )
        except (
            TypeError,
            ValueError,
        ) as exc:
            raise ValueError(
                "offset must be an integer."
            ) from exc

        if offset < 0:
            raise ValueError(
                "offset cannot be negative."
            )

        return offset