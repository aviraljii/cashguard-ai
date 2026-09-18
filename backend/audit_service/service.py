from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from audit_service.models import AuditLog


def log_audit_event(
    db: Session,
    *,
    event_type: str,
    entity_type: str,
    actor_user_id: int | None = None,
    entity_id: str | int | None = None,
    ip_address: str | None = None,
    request_id: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> AuditLog:
    """Persist security-relevant events without credentials or tokens."""
    event = AuditLog(
        actor_user_id=actor_user_id,
        event_type=event_type,
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id is not None else None,
        ip_address=ip_address,
        request_id=request_id,
        event_metadata=metadata,
    )
    db.add(event)
    db.commit()
    return event
