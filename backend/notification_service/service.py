from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from alert_service.models import Alert
from audit_service.service import log_audit_event

from notification_service.models import Notification


# ------------------------------------------------------------------
# CREATE IN-APP NOTIFICATION
# ------------------------------------------------------------------

def create_in_app_notification(
    db: Session,
    alert: Alert,
) -> Notification:
    existing = db.scalar(
        select(Notification).where(
            Notification.alert_id == alert.id,
            Notification.channel == "in_app",
        )
    )

    if existing is not None:
        return existing

    notification = Notification(
        user_id=alert.user_id,
        alert_id=alert.id,
        channel="in_app",
        notification_type="risk_alert",
        title=alert.title,
        message=alert.message,
        status="SENT",
        delivery_metadata={
            "severity": alert.severity,
            "alert_type": alert.type,
            "entity_type": alert.entity_type,
            "entity_id": alert.entity_id,
            "source": "cashguard-risk-engine",
        },
        sent_at=datetime.now(timezone.utc),
    )

    try:
        db.add(notification)
        db.commit()
        db.refresh(notification)

    except Exception:
        db.rollback()
        raise

    log_audit_event(
        db,
        event_type="notification_created",
        entity_type="notification",
        actor_user_id=alert.user_id,
        entity_id=notification.id,
        metadata={
            "alert_id": alert.id,
            "channel": notification.channel,
            "notification_type": (
                notification.notification_type
            ),
            "severity": alert.severity,
        },
    )

    return notification


# ------------------------------------------------------------------
# LIST USER NOTIFICATIONS
# ------------------------------------------------------------------

def list_notifications(
    db: Session,
    user_id: int,
    limit: int = 50,
    offset: int = 0,
) -> list[Notification]:
    statement = (
        select(Notification)
        .where(
            Notification.user_id == user_id
        )
        .order_by(
            Notification.created_at.desc()
        )
        .limit(limit)
        .offset(offset)
    )

    return list(
        db.scalars(statement)
    )


# ------------------------------------------------------------------
# GET NOTIFICATION
# ------------------------------------------------------------------

def get_notification(
    db: Session,
    notification_id: str,
    user_id: int,
) -> Notification | None:
    return db.scalar(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == user_id,
        )
    )


# ------------------------------------------------------------------
# MARK NOTIFICATION AS READ
# ------------------------------------------------------------------

def mark_notification_read(
    db: Session,
    notification: Notification,
) -> Notification:
    if notification.read_at is None:
        notification.read_at = datetime.now(
            timezone.utc
        )

    if notification.status != "READ":
        notification.status = "READ"

    try:
        db.commit()
        db.refresh(notification)

    except Exception:
        db.rollback()
        raise

    try:
        log_audit_event(
            db,
            event_type="notification_read",
            entity_type="notification",
            actor_user_id=notification.user_id,
            entity_id=notification.id,
            metadata={
                "notification_type": (
                    notification.notification_type
                ),
                "channel": notification.channel,
            },
        )
    except Exception:
        # Audit logging should not break
        # the notification state update.
        db.rollback()

    return notification


# ------------------------------------------------------------------
# MARK NOTIFICATION AS UNREAD
# ------------------------------------------------------------------

def mark_notification_unread(
    db: Session,
    notification: Notification,
) -> Notification:
    notification.read_at = None

    # A notification that was previously read
    # goes back to SENT/unread state.
    if notification.status == "READ":
        notification.status = "SENT"

    try:
        db.commit()
        db.refresh(notification)

    except Exception:
        db.rollback()
        raise

    try:
        log_audit_event(
            db,
            event_type="notification_unread",
            entity_type="notification",
            actor_user_id=notification.user_id,
            entity_id=notification.id,
            metadata={
                "notification_type": (
                    notification.notification_type
                ),
                "channel": notification.channel,
            },
        )
    except Exception:
        db.rollback()

    return notification


# ------------------------------------------------------------------
# MARK ALL USER NOTIFICATIONS AS READ
# ------------------------------------------------------------------

def mark_all_notifications_read(
    db: Session,
    user_id: int,
) -> int:
    now = datetime.now(timezone.utc)

    statement = (
        update(Notification)
        .where(
            Notification.user_id == user_id,
            Notification.read_at.is_(None),
        )
        .values(
            read_at=now,
            status="READ",
        )
    )

    try:
        result = db.execute(statement)
        updated_count = int(
            result.rowcount or 0
        )

        db.commit()

    except Exception:
        db.rollback()
        raise

    if updated_count:
        try:
            log_audit_event(
                db,
                event_type="notifications_mark_all_read",
                entity_type="notification",
                actor_user_id=user_id,
                metadata={
                    "updated_count": updated_count,
                },
            )
        except Exception:
            db.rollback()

    return updated_count