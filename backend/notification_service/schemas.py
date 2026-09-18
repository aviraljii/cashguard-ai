from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import (
    BaseModel,
    ConfigDict,
    model_validator,
)


class NotificationResponse(BaseModel):
    # --------------------------------------------------------------
    # DATABASE FIELDS
    # --------------------------------------------------------------

    id: str

    user_id: int

    alert_id: str | None = None

    channel: str

    notification_type: str

    title: str

    message: str

    status: str

    delivery_metadata: dict[str, Any] | None = None

    created_at: datetime

    sent_at: datetime | None = None

    read_at: datetime | None = None

    # --------------------------------------------------------------
    # FRONTEND-FRIENDLY FIELDS
    # --------------------------------------------------------------

    description: str = ""

    type: str = "System"

    priority: str = "Normal"

    read: bool = False

    amount: str | None = None

    entity: str | None = None

    reference: str | None = None

    related_route: str = "/dashboard"

    model_config = ConfigDict(
        from_attributes=True,
    )

    # --------------------------------------------------------------
    # BUILD FRONTEND FIELDS FROM EXISTING NOTIFICATION DATA
    # --------------------------------------------------------------

    @model_validator(mode="after")
    def build_frontend_fields(
        self,
    ) -> "NotificationResponse":
        metadata = (
            self.delivery_metadata
            or {}
        )

        # ----------------------------------------------------------
        # Description
        # ----------------------------------------------------------

        if not self.description:
            self.description = (
                self.message
            )

        # ----------------------------------------------------------
        # Read state
        # ----------------------------------------------------------

        self.read = (
            self.read_at is not None
            or self.status.upper()
            == "READ"
        )

        # ----------------------------------------------------------
        # Priority
        #
        # Existing alert/service stores severity
        # inside delivery_metadata.
        # ----------------------------------------------------------

        raw_priority = (
            metadata.get(
                "severity"
            )
            or metadata.get(
                "priority"
            )
            or metadata.get(
                "level"
            )
        )

        priority = str(
            raw_priority or ""
        ).strip().lower()

        if priority in {
            "critical",
            "urgent",
            "high",
            "important",
        }:
            self.priority = (
                "Important"
            )
        else:
            self.priority = "Normal"

        # ----------------------------------------------------------
        # Notification type
        # ----------------------------------------------------------

        raw_type = (
            metadata.get(
                "notification_type"
            )
            or metadata.get(
                "alert_type"
            )
            or self.notification_type
        )

        normalized_type = (
            str(raw_type or "")
            .strip()
            .lower()
            .replace("_", "")
            .replace("-", "")
            .replace(" ", "")
        )

        if "payment" in normalized_type:
            self.type = "Payments"

        elif "invoice" in normalized_type:
            self.type = "Invoices"

        elif "bank" in normalized_type:
            self.type = "Banking"

        elif "reconcil" in normalized_type:
            self.type = (
                "Reconciliation"
            )

        elif "customer" in normalized_type:
            self.type = "Customers"

        elif (
            "vendor" in normalized_type
            or "supplier" in normalized_type
        ):
            self.type = "Vendors"

        elif "risk" in normalized_type:
            self.type = "Risk"

        else:
            self.type = "System"

        # ----------------------------------------------------------
        # Amount
        # ----------------------------------------------------------

        raw_amount = (
            metadata.get("amount")
            or metadata.get(
                "amount_display"
            )
            or metadata.get(
                "amountDisplay"
            )
            or metadata.get(
                "value"
            )
        )

        if raw_amount is not None:
            self.amount = str(
                raw_amount
            )

        # ----------------------------------------------------------
        # Entity
        # ----------------------------------------------------------

        self.entity = (
            self.entity
            or _first_text(
                metadata.get(
                    "entity_name"
                ),
                metadata.get(
                    "entityName"
                ),
                metadata.get(
                    "entity"
                ),
                metadata.get(
                    "customer_name"
                ),
                metadata.get(
                    "customerName"
                ),
                metadata.get(
                    "vendor_name"
                ),
                metadata.get(
                    "vendorName"
                ),
            )
        )

        # ----------------------------------------------------------
        # Reference
        # ----------------------------------------------------------

        self.reference = (
            self.reference
            or _first_text(
                metadata.get(
                    "reference"
                ),
                metadata.get(
                    "reference_id"
                ),
                metadata.get(
                    "referenceId"
                ),
                metadata.get(
                    "invoice_number"
                ),
                metadata.get(
                    "invoiceNumber"
                ),
                metadata.get(
                    "payment_id"
                ),
                metadata.get(
                    "paymentId"
                ),
            )
        )

        # ----------------------------------------------------------
        # Related route
        # ----------------------------------------------------------

        related_route = _first_text(
            metadata.get(
                "related_route"
            ),
            metadata.get(
                "relatedRoute"
            ),
            metadata.get(
                "route"
            ),
            metadata.get(
                "link"
            ),
            metadata.get(
                "url"
            ),
        )

        if related_route:
            self.related_route = (
                related_route
            )
        else:
            self.related_route = (
                _default_route_for_type(
                    self.type
                )
            )

        return self


class NotificationListResponse(BaseModel):
    items: list[
        NotificationResponse
    ]

    total: int

    limit: int

    offset: int


# ------------------------------------------------------------------
# HELPERS
# ------------------------------------------------------------------


def _first_text(
    *values: Any,
) -> str | None:
    for value in values:
        if value is None:
            continue

        value_text = str(
            value
        ).strip()

        if value_text:
            return value_text

    return None


def _default_route_for_type(
    notification_type: str,
) -> str:
    routes = {
        "Payments": "/payments",
        "Invoices": "/invoices",
        "Banking": "/dashboard/banking",
        "Reconciliation": "/reconciliation",
        "Customers": "/customers",
        "Vendors": "/vendors",
        "Risk": "/risk-intelligence",
        "System": "/analytics",
    }

    return routes.get(
        notification_type,
        "/dashboard",
    )