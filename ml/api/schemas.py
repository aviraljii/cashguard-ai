from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, field_validator


# ============================================================================
# PAYMENT-DELAY PREDICTION REQUEST
# ============================================================================


class PaymentDelayPredictionRequest(BaseModel):
    """
    Request payload for payment-delay risk prediction.

    Supported payload examples:

        {
            "invoice_id": "INV-000844"
        }

        {
            "invoice_id": "21b63ec6-1343-454d-849b-fd6310884092"
        }

    The identifier may be:
    - an internal invoice UUID
    - a human-readable invoice number
    """

    model_config = ConfigDict(
        extra="forbid",
        str_strip_whitespace=True,
    )

    invoice_id: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description=(
            "Invoice identifier. Can be an internal invoice UUID "
            "or a human-readable invoice number such as INV-000844."
        ),
        examples=[
            "21b63ec6-1343-454d-849b-fd6310884092",
            "INV-000844",
        ],
    )

    @field_validator("invoice_id", mode="before")
    @classmethod
    def validate_invoice_id(cls, value: object) -> str:
        """
        Normalize and validate invoice_id before Pydantic
        converts the value to the final string type.
        """

        # Reject missing/null values.
        if value is None:
            raise ValueError("invoice_id is required.")

        # Accept normal strings.
        if isinstance(value, str):
            normalized = value.strip()

        # Accept integer/float identifiers by converting them to strings.
        elif isinstance(value, (int, float)) and not isinstance(value, bool):
            normalized = str(value).strip()

        # Reject unsupported payload types.
        else:
            raise ValueError(
                "invoice_id must be a string, number, or UUID-like value."
            )

        # Reject empty values.
        if not normalized:
            raise ValueError("invoice_id cannot be empty.")

        # Protect the API from unreasonable identifier sizes.
        if len(normalized) > 255:
            raise ValueError("invoice_id is too long.")

        return normalized


# ============================================================================
# PAYMENT-DELAY PREDICTION RESPONSE
# ============================================================================


class PaymentDelayPredictionResponse(BaseModel):
    """
    Response returned by the payment-delay prediction endpoint.

    Example:

        {
            "invoice_id": "INV-000844",
            "risk_probability": 0.7312,
            "risk_score": 73,
            "risk_category": "High"
        }
    """

    model_config = ConfigDict(
        extra="forbid",
    )

    invoice_id: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="Resolved invoice identifier.",
    )

    risk_probability: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description=(
            "Probability of payment delay, represented "
            "as a value between 0 and 1."
        ),
    )

    risk_score: int = Field(
        ...,
        ge=0,
        le=100,
        description="Payment-delay risk score from 0 to 100.",
    )

    risk_category: str = Field(
        ...,
        min_length=1,
        description=(
            "Human-readable risk category such as "
            "Low, Medium, or High."
        ),
    )

    @field_validator("invoice_id")
    @classmethod
    def validate_response_invoice_id(cls, value: str) -> str:
        """
        Normalize the resolved invoice identifier.
        """

        normalized = value.strip()

        if not normalized:
            raise ValueError(
                "Resolved invoice_id cannot be empty."
            )

        if len(normalized) > 255:
            raise ValueError(
                "Resolved invoice_id is too long."
            )

        return normalized

    @field_validator("risk_category")
    @classmethod
    def normalize_risk_category(cls, value: str) -> str:
        """
        Normalize standard risk-category casing.
        """

        normalized = value.strip()

        if not normalized:
            raise ValueError(
                "risk_category cannot be empty."
            )

        category_map = {
            "low": "Low",
            "medium": "Medium",
            "high": "High",
        }

        return category_map.get(
            normalized.lower(),
            normalized,
        )


# ============================================================================
# EXPORTS
# ============================================================================


__all__ = [
    "PaymentDelayPredictionRequest",
    "PaymentDelayPredictionResponse",
]
