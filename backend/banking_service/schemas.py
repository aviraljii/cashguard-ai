from __future__ import annotations

from datetime import (
    date,
    datetime,
)

from decimal import Decimal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
)


# ==================================================================
# BANK ACCOUNT CREATE
# ==================================================================


class BankAccountCreate(BaseModel):
    """
    Request schema for connecting a bank account.
    """

    provider: str = Field(
        default="sandbox",
        min_length=2,
        max_length=50,
        description="Banking provider name.",
    )

    external_account_id: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description=(
            "External/provider-side bank account identifier."
        ),
    )

    name: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description=(
            "Display name of the bank account."
        ),
    )

    currency: str = Field(
        default="INR",
        min_length=3,
        max_length=3,
        description="Account currency.",
    )

    balance: Decimal | None = Field(
        default=None,
        max_digits=18,
        decimal_places=2,
        description="Current account balance.",
    )

    # --------------------------------------------------------------
    # Normalize provider
    # --------------------------------------------------------------

    @field_validator(
        "provider",
        mode="before",
    )
    @classmethod
    def validate_provider(
        cls,
        value,
    ) -> str:
        provider = (
            str(
                value or ""
            )
            .strip()
            .lower()
        )

        if not provider:
            return "sandbox"

        return provider

    # --------------------------------------------------------------
    # Normalize external account ID
    # --------------------------------------------------------------

    @field_validator(
        "external_account_id",
        mode="before",
    )
    @classmethod
    def validate_external_account_id(
        cls,
        value,
    ) -> str:
        cleaned = (
            str(
                value or ""
            )
            .strip()
        )

        if not cleaned:
            raise ValueError(
                "external_account_id is required."
            )

        return cleaned

    # --------------------------------------------------------------
    # Normalize account name
    # --------------------------------------------------------------

    @field_validator(
        "name",
        mode="before",
    )
    @classmethod
    def validate_name(
        cls,
        value,
    ) -> str:
        cleaned = (
            str(
                value or ""
            )
            .strip()
        )

        if not cleaned:
            raise ValueError(
                "Bank account name is required."
            )

        return cleaned

    # --------------------------------------------------------------
    # Normalize currency
    # --------------------------------------------------------------

    @field_validator(
        "currency",
        mode="before",
    )
    @classmethod
    def validate_currency(
        cls,
        value,
    ) -> str:
        currency = (
            str(
                value or "INR"
            )
            .strip()
            .upper()
        )

        if len(currency) != 3:
            raise ValueError(
                "currency must be a 3-letter currency code."
            )

        return currency


# ==================================================================
# BANK ACCOUNT RESPONSE
# ==================================================================


class BankAccountResponse(BaseModel):
    """
    Bank account API response.
    """

    id: str

    user_id: int

    provider: str

    external_account_id: str

    name: str

    currency: str

    balance: Decimal | None = None

    sync_status: str

    last_synced_at: datetime | None = None

    created_at: datetime | None = None

    updated_at: datetime | None = None

    model_config = ConfigDict(
        from_attributes=True,
    )

    # --------------------------------------------------------------
    # Normalize optional database strings
    # --------------------------------------------------------------

    @field_validator(
        "provider",
        "external_account_id",
        "name",
        "currency",
        "sync_status",
        mode="before",
    )
    @classmethod
    def normalize_strings(
        cls,
        value,
    ):
        if value is None:
            return value

        return str(
            value
        ).strip()


# ==================================================================
# BANK TRANSACTION RESPONSE
#
# Aligned with the existing bank_transactions table.
#
# Existing fields:
#
# id
# business_id
# transaction_date
# transaction_type
# category
# amount
# running_balance
# description
# reference_number
# customer_id
# supplier_id
# invoice_payment_id
# expense_id
# created_at
#
# No account_id is introduced.
# ==================================================================


class BankTransactionResponse(BaseModel):
    """
    Bank transaction API response.
    """

    id: str

    business_id: str

    transaction_date: date

    transaction_type: str

    category: str

    amount: Decimal = Field(
        ...,
        decimal_places=2,
    )

    running_balance: Decimal = Field(
        ...,
        decimal_places=2,
    )

    description: str

    reference_number: str | None = None

    customer_id: str | None = None

    supplier_id: str | None = None

    invoice_payment_id: str | None = None

    expense_id: str | None = None

    created_at: datetime

    model_config = ConfigDict(
        from_attributes=True,
    )

    # --------------------------------------------------------------
    # Normalize IDs / strings
    # --------------------------------------------------------------

    @field_validator(
        "id",
        "business_id",
        "transaction_type",
        "category",
        "description",
        mode="before",
    )
    @classmethod
    def normalize_required_strings(
        cls,
        value,
    ) -> str:
        cleaned = (
            str(
                value or ""
            )
            .strip()
        )

        if not cleaned:
            raise ValueError(
                "Required transaction field cannot be empty."
            )

        return cleaned

    # --------------------------------------------------------------
    # Normalize optional references
    # --------------------------------------------------------------

    @field_validator(
        "reference_number",
        "customer_id",
        "supplier_id",
        "invoice_payment_id",
        "expense_id",
        mode="before",
    )
    @classmethod
    def normalize_optional_strings(
        cls,
        value,
    ):
        if value is None:
            return None

        cleaned = (
            str(
                value
            )
            .strip()
        )

        return cleaned or None

    # --------------------------------------------------------------
    # Decimal normalization
    # --------------------------------------------------------------

    @field_validator(
        "amount",
        "running_balance",
        mode="before",
    )
    @classmethod
    def normalize_decimal(
        cls,
        value,
    ) -> Decimal:
        if value is None:
            raise ValueError(
                "Transaction amount fields cannot be null."
            )

        try:
            return Decimal(
                str(
                    value
                ).strip()
            )
        except Exception as exc:
            raise ValueError(
                "Invalid decimal transaction value."
            ) from exc


# ==================================================================
# BANK TRANSACTION SUMMARY
# ==================================================================


class BankTransactionSummaryResponse(BaseModel):
    """
    Banking KPI summary response.
    """

    total_transactions: int = Field(
        ...,
        ge=0,
        description=(
            "Total number of transactions."
        ),
    )

    total_credit: Decimal = Field(
        ...,
        ge=0,
        decimal_places=2,
        description=(
            "Total incoming/credit amount."
        ),
    )

    total_debit: Decimal = Field(
        ...,
        ge=0,
        decimal_places=2,
        description=(
            "Total outgoing/debit amount."
        ),
    )

    balance: Decimal = Field(
        ...,
        decimal_places=2,
        description=(
            "Latest available running balance."
        ),
    )

    # --------------------------------------------------------------
    # Normalize integer
    # --------------------------------------------------------------

    @field_validator(
        "total_transactions",
        mode="before",
    )
    @classmethod
    def normalize_total_transactions(
        cls,
        value,
    ) -> int:
        try:
            normalized = int(
                str(
                    value
                ).strip()
            )
        except (
            TypeError,
            ValueError,
        ) as exc:
            raise ValueError(
                "total_transactions must be an integer."
            ) from exc

        if normalized < 0:
            raise ValueError(
                "total_transactions cannot be negative."
            )

        return normalized

    # --------------------------------------------------------------
    # Normalize money fields
    # --------------------------------------------------------------

    @field_validator(
        "total_credit",
        "total_debit",
        "balance",
        mode="before",
    )
    @classmethod
    def normalize_money(
        cls,
        value,
    ) -> Decimal:
        if value is None:
            return Decimal("0.00")

        try:
            return Decimal(
                str(
                    value
                ).strip()
            )
        except Exception as exc:
            raise ValueError(
                "Invalid banking summary amount."
            ) from exc


# ==================================================================
# WEBHOOK RESPONSE
# ==================================================================


class WebhookResponse(BaseModel):
    """
    Banking webhook processing response.
    """

    accepted: bool

    duplicate: bool = False

    message: str = Field(
        ...,
        min_length=1,
    )

    # --------------------------------------------------------------
    # Normalize message
    # --------------------------------------------------------------

    @field_validator(
        "message",
        mode="before",
    )
    @classmethod
    def validate_message(
        cls,
        value,
    ) -> str:
        cleaned = (
            str(
                value or ""
            )
            .strip()
        )

        if not cleaned:
            raise ValueError(
                "Webhook response message cannot be empty."
            )

        return cleaned