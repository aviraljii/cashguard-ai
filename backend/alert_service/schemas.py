from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class AlertResponse(BaseModel):
    id: str

    user_id: int

    risk_result_id: str | None

    type: str

    severity: str

    title: str

    message: str

    entity_type: str | None

    entity_id: str | None

    status: str

    alert_metadata: dict[str, Any] | None

    created_at: datetime

    read_at: datetime | None

    resolved_at: datetime | None

    model_config = ConfigDict(
        from_attributes=True,
    )


class AlertListResponse(BaseModel):
    items: list[AlertResponse]

    total: int

    limit: int

    offset: int