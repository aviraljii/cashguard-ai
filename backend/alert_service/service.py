from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from audit_service.service import log_audit_event

from alert_service.models import Alert

from risk_service.models.risk_result import RiskResult


# ------------------------------------------------------------------
# RISK THRESHOLDS
# ------------------------------------------------------------------

HIGH_RISK_THRESHOLD = 60

CRITICAL_RISK_THRESHOLD = 80


# ------------------------------------------------------------------
# ALERT CONFIGURATION
# ------------------------------------------------------------------

def _alert_config(
    risk_result: RiskResult,
) -> tuple[str, str, str, str] | None:
    score = float(
        risk_result.risk_score
    )

    if score >= CRITICAL_RISK_THRESHOLD:
        return (
            "HIGH_RISK_TRANSACTION",
            "CRITICAL",
            "Critical payment risk detected",
            "A critical-risk payment requires immediate review.",
        )

    if score >= HIGH_RISK_THRESHOLD:
        return (
            "HIGH_RISK_TRANSACTION",
            "HIGH",
            "High payment risk detected",
            "A high-risk payment requires review.",
        )

    return None


# ------------------------------------------------------------------
# CREATE ALERT FOR RISK
# ------------------------------------------------------------------

def create_alert_for_risk(
    db: Session,
    risk_result: RiskResult,
) -> Alert | None:
    config = _alert_config(
        risk_result
    )

    if config is None:
        return None

    (
        alert_type,
        severity,
        title,
        message,
    ) = config

    # --------------------------------------------------------------
    # DUPLICATE PROTECTION
    # --------------------------------------------------------------

    existing = db.scalar(
        select(Alert).where(
            Alert.risk_result_id
            == risk_result.id,
            Alert.type == alert_type,
        )
    )

    if existing is not None:
        return existing

    # --------------------------------------------------------------
    # CREATE ALERT
    # --------------------------------------------------------------

    alert = Alert(
        user_id=risk_result.user_id,
        risk_result_id=risk_result.id,
        type=alert_type,
        severity=severity,
        title=title,
        message=message,
        entity_type="payment",
        entity_id=risk_result.payment_id,
        status="UNREAD",
        alert_metadata={
            "risk_score": float(
                risk_result.risk_score
            ),
            "risk_level": risk_result.risk_level,
            "model_version": (
                risk_result.model_version
            ),
            "prediction_source": (
                risk_result.prediction_source
            ),
            "signals": (
                risk_result.signals
                or []
            ),
        },
    )

    try:
        db.add(alert)
        db.commit()
        db.refresh(alert)

    except Exception:
        db.rollback()
        raise

    # --------------------------------------------------------------
    # AUDIT LOG
    # --------------------------------------------------------------

    log_audit_event(
        db,
        event_type="alert_created",
        entity_type="alert",
        actor_user_id=risk_result.user_id,
        entity_id=alert.id,
        metadata={
            "type": alert.type,
            "severity": alert.severity,
            "risk_result_id": (
                risk_result.id
            ),
            "risk_score": float(
                risk_result.risk_score
            ),
        },
    )

    # --------------------------------------------------------------
    # AUTOMATIC NOTIFICATION
    # --------------------------------------------------------------

    try:
        from notification_service.service import (
            create_in_app_notification,
        )

        create_in_app_notification(
            db,
            alert,
        )

    except Exception as exc:
        try:
            db.rollback()

            log_audit_event(
                db,
                event_type="notification_generation_failed",
                entity_type="alert",
                actor_user_id=alert.user_id,
                entity_id=alert.id,
                metadata={
                    "alert_id": alert.id,
                    "error": str(exc),
                },
            )

        except Exception:
            pass

    return alert


# ------------------------------------------------------------------
# LIST ALERTS
# ------------------------------------------------------------------

def list_alerts(
    db: Session,
    user_id: int,
    limit: int = 50,
    offset: int = 0,
) -> list[Alert]:
    statement = (
        select(Alert)
        .where(
            Alert.user_id == user_id
        )
        .order_by(
            Alert.created_at.desc()
        )
        .limit(limit)
        .offset(offset)
    )

    return list(
        db.scalars(statement)
    )


# ------------------------------------------------------------------
# GET SINGLE ALERT
# ------------------------------------------------------------------

def get_alert(
    db: Session,
    alert_id: str,
    user_id: int,
) -> Alert | None:
    return db.scalar(
        select(Alert).where(
            Alert.id == alert_id,
            Alert.user_id == user_id,
        )
    )


# ------------------------------------------------------------------
# MARK ALERT AS READ
# ------------------------------------------------------------------

def mark_alert_read(
    db: Session,
    alert: Alert,
) -> Alert:
    if alert.status == "UNREAD":
        alert.status = "READ"

        alert.read_at = datetime.now(
            timezone.utc
        )

        db.commit()
        db.refresh(alert)

    return alert


# ------------------------------------------------------------------
# RESOLVE ALERT
# ------------------------------------------------------------------

def resolve_alert(
    db: Session,
    alert: Alert,
) -> Alert:
    alert.status = "RESOLVED"

    alert.resolved_at = datetime.now(
        timezone.utc
    )

    db.commit()
    db.refresh(alert)

    log_audit_event(
        db,
        event_type="alert_resolved",
        entity_type="alert",
        actor_user_id=alert.user_id,
        entity_id=alert.id,
    )

    return alert