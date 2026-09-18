from __future__ import annotations

from typing import Any, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    model_validator,
)


# ============================================================================
# SUPPORTED AI DOMAINS
# ============================================================================

Domain = Literal[
    "customer",
    "invoice_collection",
    "inventory",
    "cash_flow",
    "sales",
    "transaction_anomaly",
]


# ============================================================================
# BASE MODEL
# ============================================================================

class CashGuardBaseModel(BaseModel):
    """
    Common Pydantic configuration for CashGuard-AI AI schemas.
    """

    model_config = ConfigDict(
        extra="allow",
        str_strip_whitespace=True,
    )


# ============================================================================
# AI INSIGHT REQUEST
# ============================================================================

class InsightRequest(CashGuardBaseModel):
    """
    Generic AI insight request.

    Supported request formats:

    Format 1 - preferred:

        {
            "business_id": "...",
            "intelligence": {
                ...
            }
        }

    Format 2 - backward-compatible:

        {
            "intelligence": {
                "business_id": "...",
                ...
            }
        }

    The validator below automatically promotes the nested business_id
    into the top-level field.
    """

    business_id: str = Field(
        ...,
        min_length=1,
        description=(
            "Unique business identifier used for AI analysis."
        ),
    )

    intelligence: dict[str, Any] = Field(
        ...,
        description=(
            "Structured business intelligence payload."
        ),
    )

    @model_validator(mode="before")
    @classmethod
    def normalize_request(
        cls,
        value: Any,
    ) -> Any:
        """
        Normalize both supported request shapes before normal Pydantic
        validation.

        This permanently prevents the common:

            body.business_id -> Field required

        error when business_id is sent inside intelligence.
        """

        if not isinstance(value, dict):
            return value

        payload = dict(value)

        intelligence = payload.get(
            "intelligence"
        )

        # ---------------------------------------------------------------
        # Case 1:
        # business_id already exists at the top level.
        # ---------------------------------------------------------------

        top_level_business_id = payload.get(
            "business_id"
        )

        if (
            isinstance(
                top_level_business_id,
                str,
            )
            and top_level_business_id.strip()
        ):
            payload["business_id"] = (
                top_level_business_id.strip()
            )

        # ---------------------------------------------------------------
        # Case 2:
        # business_id exists inside intelligence.
        # Promote it to top-level.
        # ---------------------------------------------------------------

        elif isinstance(
            intelligence,
            dict,
        ):
            nested_business_id = intelligence.get(
                "business_id"
            )

            if (
                isinstance(
                    nested_business_id,
                    str,
                )
                and nested_business_id.strip()
            ):
                payload["business_id"] = (
                    nested_business_id.strip()
                )

        return payload


# ============================================================================
# UNIFIED AI INSIGHT REQUEST
# ============================================================================

class UnifiedInsightRequest(InsightRequest):
    """
    Request used by the unified AI insight endpoint.
    """

    domain: Domain = Field(
        ...,
        description="CashGuard-AI intelligence domain.",
    )


# ============================================================================
# GENERATED INSIGHT
# ============================================================================

class Insight(CashGuardBaseModel):
    """
    Structured AI-generated insight.
    """

    domain: Domain

    summary: str = Field(
        ...,
        min_length=1,
        description="Primary AI-generated business insight.",
    )

    confidence_note: str = Field(
        ...,
        min_length=1,
        description=(
            "Explanation of confidence and underlying data quality."
        ),
    )

    key_reasons: list[str] = Field(
        default_factory=list,
    )

    risks: list[str] = Field(
        default_factory=list,
    )

    opportunities: list[str] = Field(
        default_factory=list,
    )

    recommendations: list[str] = Field(
        default_factory=list,
    )

    priority: str | None = Field(
        default=None,
    )

    why_it_matters: str | None = Field(
        default=None,
    )

    collection_actions: list[str] = Field(
        default_factory=list,
    )

    trend: str | None = Field(
        default=None,
    )

    key_drivers: list[str] = Field(
        default_factory=list,
    )

    inventory_risks: list[str] = Field(
        default_factory=list,
    )

    why_flagged: list[str] = Field(
        default_factory=list,
    )

    risk_level: str | None = Field(
        default=None,
    )

    recommended_actions: list[str] = Field(
        default_factory=list,
    )


# ============================================================================
# AI RESPONSE ENVELOPE
# ============================================================================

class InsightEnvelope(CashGuardBaseModel):
    """
    Standard successful AI insight response.
    """

    status: Literal["success"] = "success"

    insight: Insight