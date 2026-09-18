from __future__ import annotations

import logging
from decimal import Decimal, InvalidOperation
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from audit_service.service import (
    log_audit_event,
)

from payment_service.models import (
    Payment,
)

from risk_service.feature_engineering import (
    build_ml_feature_vector,
)

from risk_service.models.risk_result import (
    RiskResult,
)

from risk_service.predictor import (
    RiskPredictor,
)


# ============================================================================
# LOGGING
# ============================================================================

logger = logging.getLogger(
    "cashguard.risk.service"
)


# ============================================================================
# RISK PREDICTOR
# ============================================================================

predictor = RiskPredictor()


# ============================================================================
# HELPERS
# ============================================================================


def _to_decimal(
    value: Any,
) -> Decimal | None:
    """
    Safely convert a numeric value into Decimal.

    Returns None for invalid or non-finite values.
    """

    if value is None:
        return None

    try:
        decimal_value = Decimal(
            str(value)
        )

        if not decimal_value.is_finite():
            return None

        return decimal_value

    except (
        InvalidOperation,
        ValueError,
        TypeError,
    ):
        return None


def _normalize_risk_score(
    value: Any,
) -> float:
    """
    Normalize risk score to 0-100.
    """

    try:
        score = float(value)

    except (
        TypeError,
        ValueError,
        OverflowError,
    ):
        return 0.0

    if score != score:
        return 0.0

    if score == float("inf"):
        return 100.0

    if score == float("-inf"):
        return 0.0

    return max(
        0.0,
        min(
            100.0,
            score,
        ),
    )


def _normalize_probability(
    value: Any,
) -> Decimal | None:
    """
    Normalize prediction probability to 0-1.
    """

    decimal_value = _to_decimal(
        value
    )

    if decimal_value is None:
        return None

    if decimal_value < Decimal("0"):
        return Decimal("0")

    if decimal_value > Decimal("1"):
        return Decimal("1")

    return decimal_value


def _safe_model_version(
    prediction: Any,
) -> str:
    """
    Return a safe model version.
    """

    value = getattr(
        prediction,
        "model_version",
        None,
    )

    if value is None:
        return "unknown"

    normalized = str(
        value
    ).strip()

    return (
        normalized
        if normalized
        else "unknown"
    )


def _safe_prediction_source(
    prediction: Any,
) -> str:
    """
    Return a safe prediction source.
    """

    value = getattr(
        prediction,
        "source",
        None,
    )

    if value is None:
        return "risk_predictor"

    normalized = str(
        value
    ).strip()

    return (
        normalized
        if normalized
        else "risk_predictor"
    )


def _safe_risk_level(
    prediction: Any,
) -> str:
    """
    Normalize risk level while preserving
    the predictor's classification.
    """

    value = getattr(
        prediction,
        "risk_level",
        None,
    )

    if value is None:
        return "Low"

    normalized = str(
        value
    ).strip()

    return (
        normalized
        if normalized
        else "Low"
    )


def _risk_level_from_score(
    risk_score: float,
) -> str:
    """
    Deterministic fallback risk classification.
    """

    score = _normalize_risk_score(
        risk_score
    )

    if score >= 80:
        return "Critical"

    if score >= 60:
        return "High"

    if score >= 30:
        return "Medium"

    return "Low"


# ============================================================================
# BUILD RISK SIGNALS
# ============================================================================


def _build_signals(
    features: dict[str, float],
    risk_score: float,
) -> list[str]:
    """
    Convert model features into deterministic
    human-readable risk signals.
    """

    signals: list[str] = []

    amount_deviation = float(
        features.get(
            "amount_deviation_ratio",
            0.0,
        )
        or 0.0
    )

    failed_payment_ratio = float(
        features.get(
            "failed_payment_ratio",
            0.0,
        )
        or 0.0
    )

    failed_payment_count = float(
        features.get(
            "failed_payment_count",
            0.0,
        )
        or 0.0
    )

    transaction_velocity = float(
        features.get(
            "transaction_velocity_24h",
            0.0,
        )
        or 0.0
    )

    if amount_deviation >= 2.0:
        signals.append(
            "payment_amount_significantly_above_historical_average"
        )

    elif amount_deviation >= 1.0:
        signals.append(
            "payment_amount_above_historical_average"
        )

    if failed_payment_ratio >= 0.5:
        signals.append(
            "high_failed_payment_ratio"
        )

    elif failed_payment_ratio >= 0.25:
        signals.append(
            "elevated_failed_payment_ratio"
        )

    if failed_payment_count >= 5:
        signals.append(
            "multiple_recent_failed_payments"
        )

    elif failed_payment_count >= 3:
        signals.append(
            "repeated_payment_failures"
        )

    if transaction_velocity >= 20:
        signals.append(
            "very_high_transaction_velocity_24h"
        )

    elif transaction_velocity >= 10:
        signals.append(
            "elevated_transaction_velocity_24h"
        )

    if risk_score >= 80:
        signals.append(
            "critical_risk_score"
        )

    elif risk_score >= 60:
        signals.append(
            "high_risk_score"
        )

    elif risk_score >= 30:
        signals.append(
            "medium_risk_score"
        )

    return signals


# ============================================================================
# GET USER PAYMENT
# ============================================================================


def get_user_payment(
    db: Session,
    payment_id: str,
    user_id: int,
) -> Payment | None:
    """
    Return a payment only when it belongs
    to the authenticated user.
    """

    normalized_payment_id = (
        str(payment_id).strip()
        if payment_id is not None
        else ""
    )

    if not normalized_payment_id:
        return None

    return db.scalar(
        select(Payment).where(
            Payment.id
            == normalized_payment_id,
            Payment.user_id
            == user_id,
        )
    )


# ============================================================================
# CREATE ALERT FROM RISK RESULT
# ============================================================================


def _trigger_risk_alert(
    db: Session,
    risk_result: RiskResult,
) -> None:
    """
    Create an alert for HIGH/CRITICAL risk.

    Alert errors never invalidate an already-created
    risk result.
    """

    try:

        from alert_service.service import (
            create_alert_for_risk,
        )

        create_alert_for_risk(
            db,
            risk_result,
        )

    except Exception as exc:

        logger.exception(
            "Risk alert generation failed "
            "for risk_result_id=%s",
            getattr(
                risk_result,
                "id",
                None,
            ),
        )

        try:
            db.rollback()
        except Exception:
            pass

        try:

            log_audit_event(
                db,
                event_type=(
                    "alert_generation_failed"
                ),
                entity_type="risk_result",
                actor_user_id=(
                    risk_result.user_id
                ),
                entity_id=(
                    risk_result.id
                ),
                metadata={
                    "risk_result_id": (
                        risk_result.id
                    ),
                    "payment_id": (
                        risk_result.payment_id
                    ),
                    "error": str(exc),
                },
            )

        except Exception:

            logger.exception(
                "Failed to write alert-generation audit event."
            )


# ============================================================================
# CREATE / UPDATE RISK RESULT
# ============================================================================


def calculate_payment_risk(
    db: Session,
    payment: Payment,
) -> RiskResult:
    """
    Calculate payment risk using the existing
    ML feature-engineering and RiskPredictor pipeline.

    The resulting prediction is persisted to RiskResult.
    """

    if payment is None:
        raise ValueError(
            "Payment is required."
        )

    payment_id = getattr(
        payment,
        "id",
        None,
    )

    if not payment_id:
        raise ValueError(
            "Payment ID is required."
        )

    user_id = getattr(
        payment,
        "user_id",
        None,
    )

    if user_id is None:
        raise ValueError(
            "Payment user_id is required."
        )

    # ------------------------------------------------------------------------
    # BUILD FEATURES
    # ------------------------------------------------------------------------

    try:

        features = (
            build_ml_feature_vector(
                db,
                payment,
            )
        )

    except Exception as exc:

        logger.exception(
            "Failed to build ML feature vector "
            "for payment_id=%s",
            payment_id,
        )

        raise RuntimeError(
            "Failed to build payment risk features."
        ) from exc

    if not isinstance(
        features,
        dict,
    ):
        raise RuntimeError(
            "Risk feature builder returned an invalid result."
        )

    # Normalize feature values before storing/using.
    normalized_features: dict[
        str,
        float
    ] = {}

    for key, value in features.items():
        try:
            normalized_features[str(key)] = float(
                value
            )
        except (
            TypeError,
            ValueError,
            OverflowError,
        ):
            normalized_features[str(key)] = 0.0

    # ------------------------------------------------------------------------
    # PREDICT RISK
    # ------------------------------------------------------------------------

    try:

        prediction = predictor.predict(
            normalized_features
        )

    except Exception as exc:

        logger.exception(
            "Risk prediction failed "
            "for payment_id=%s",
            payment_id,
        )

        raise RuntimeError(
            "Failed to calculate payment risk."
        ) from exc

    if prediction is None:
        raise RuntimeError(
            "Risk predictor returned no prediction."
        )

    risk_score = _normalize_risk_score(
        getattr(
            prediction,
            "risk_score",
            0.0,
        )
    )

    predictor_risk_level = (
        _safe_risk_level(
            prediction
        )
    )

    probability = (
        _normalize_probability(
            getattr(
                prediction,
                "probability",
                None,
            )
        )
    )

    model_version = (
        _safe_model_version(
            prediction
        )
    )

    prediction_source = (
        _safe_prediction_source(
            prediction
        )
    )

    # Keep predictor classification when available.
    risk_level = (
        predictor_risk_level
        if predictor_risk_level
        else _risk_level_from_score(
            risk_score
        )
    )

    signals = _build_signals(
        features=normalized_features,
        risk_score=risk_score,
    )

    # ------------------------------------------------------------------------
    # FIND EXISTING RESULT
    # ------------------------------------------------------------------------

    try:

        existing_result = db.scalar(
            select(
                RiskResult
            ).where(
                RiskResult.payment_id
                == payment_id,
                RiskResult.model_version
                == model_version,
            )
        )

    except Exception as exc:

        logger.exception(
            "Failed to load existing risk result "
            "for payment_id=%s",
            payment_id,
        )

        raise RuntimeError(
            "Failed to load existing risk result."
        ) from exc

    # ------------------------------------------------------------------------
    # UPDATE EXISTING RESULT
    # ------------------------------------------------------------------------

    if existing_result is not None:

        existing_result.risk_score = (
            Decimal(
                str(
                    risk_score
                )
            )
        )

        existing_result.risk_level = (
            risk_level
        )

        existing_result.probability = (
            probability
        )

        existing_result.prediction_source = (
            prediction_source
        )

        existing_result.features = (
            normalized_features
        )

        existing_result.signals = (
            signals
        )

        try:

            db.commit()

            db.refresh(
                existing_result
            )

        except Exception as exc:

            db.rollback()

            logger.exception(
                "Failed to update risk result "
                "for payment_id=%s",
                payment_id,
            )

            raise RuntimeError(
                "Failed to save payment risk result."
            ) from exc

        _trigger_risk_alert(
            db,
            existing_result,
        )

        return existing_result

    # ------------------------------------------------------------------------
    # CREATE NEW RESULT
    # ------------------------------------------------------------------------

    risk_result = RiskResult(
        payment_id=payment_id,
        user_id=user_id,
        risk_score=Decimal(
            str(
                risk_score
            )
        ),
        risk_level=risk_level,
        probability=probability,
        model_version=model_version,
        prediction_source=prediction_source,
        features=normalized_features,
        signals=signals,
    )

    try:

        db.add(
            risk_result
        )

        db.commit()

        db.refresh(
            risk_result
        )

    except Exception as exc:

        db.rollback()

        logger.exception(
            "Failed to save new risk result "
            "for payment_id=%s",
            payment_id,
        )

        raise RuntimeError(
            "Failed to save payment risk result."
        ) from exc

    # ------------------------------------------------------------------------
    # AUDIT
    # ------------------------------------------------------------------------

    try:

        log_audit_event(
            db,
            event_type="risk_generated",
            entity_type="risk_result",
            entity_id=risk_result.id,
            actor_user_id=user_id,
            metadata={
                "payment_id": payment_id,
                "risk_score": risk_score,
                "risk_level": risk_level,
                "prediction_source":
                    prediction_source,
                "model_version":
                    model_version,
            },
        )

    except Exception:

        logger.exception(
            "Risk audit logging failed "
            "for risk_result_id=%s",
            risk_result.id,
        )

        try:
            db.rollback()
        except Exception:
            pass

    # ------------------------------------------------------------------------
    # AUTOMATIC ALERT
    # ------------------------------------------------------------------------

    _trigger_risk_alert(
        db,
        risk_result,
    )

    return risk_result


# ============================================================================
# CALCULATE RISK BY PAYMENT ID
# ============================================================================


def calculate_payment_risk_by_id(
    db: Session,
    payment_id: str,
    user_id: int,
) -> RiskResult | None:
    """
    Find user's payment and calculate its risk.
    """

    normalized_payment_id = (
        str(payment_id).strip()
        if payment_id is not None
        else ""
    )

    if not normalized_payment_id:
        return None

    payment = get_user_payment(
        db=db,
        payment_id=normalized_payment_id,
        user_id=user_id,
    )

    if payment is None:
        return None

    return calculate_payment_risk(
        db=db,
        payment=payment,
    )


# ============================================================================
# GET LATEST PAYMENT RISK
# ============================================================================


def get_latest_payment_risk(
    db: Session,
    payment_id: str,
    user_id: int,
) -> RiskResult | None:
    """
    Get the most recent risk result for a payment
    belonging to the authenticated user.
    """

    normalized_payment_id = (
        str(payment_id).strip()
        if payment_id is not None
        else ""
    )

    if not normalized_payment_id:
        return None

    statement = (
        select(
            RiskResult
        )
        .join(
            Payment,
            Payment.id
            == RiskResult.payment_id,
        )
        .where(
            RiskResult.payment_id
            == normalized_payment_id,
            RiskResult.user_id
            == user_id,
            Payment.user_id
            == user_id,
        )
        .order_by(
            RiskResult.created_at.desc()
        )
    )

    return db.scalars(
        statement
    ).first()


# ============================================================================
# LIST USER RISK RESULTS
# ============================================================================


def list_risk_results(
    db: Session,
    user_id: int,
    limit: int = 50,
    offset: int = 0,
) -> list[RiskResult]:
    """
    Return paginated risk results belonging
    to the authenticated user.
    """

    safe_limit = max(
        1,
        min(
            100,
            int(limit),
        ),
    )

    safe_offset = max(
        0,
        int(offset),
    )

    statement = (
        select(
            RiskResult
        )
        .where(
            RiskResult.user_id
            == user_id
        )
        .order_by(
            RiskResult.created_at.desc()
        )
        .limit(
            safe_limit
        )
        .offset(
            safe_offset
        )
    )

    results = db.scalars(
        statement
    ).all()

    return list(
        results
    )


# ============================================================================
# RISK SUMMARY FOR AI INSIGHTS
# ============================================================================


def get_risk_summary_for_user(
    db: Session,
    user_id: int,
) -> dict[str, Any]:
    """
    Return a compact live ML risk summary.

    This function is intentionally read-only and is designed
    for the AI Insights orchestration layer.

    Returned values:
        total_predictions
        high_risk_count
        critical_risk_count
        medium_risk_count
        low_risk_count
        average_risk_score
        highest_risk_score
        high_priority_signals
        latest_model_version
        latest_prediction_source
        recent_signals
    """

    if user_id is None:
        raise ValueError(
            "user_id is required."
        )

    try:

        total_predictions = db.scalar(
            select(
                func.count(
                    RiskResult.id
                )
            ).where(
                RiskResult.user_id
                == user_id
            )
        ) or 0

        high_risk_count = db.scalar(
            select(
                func.count(
                    RiskResult.id
                )
            ).where(
                RiskResult.user_id
                == user_id,
                func.lower(
                    RiskResult.risk_level
                ).in_(
                    [
                        "high",
                        "critical",
                    ]
                ),
            )
        ) or 0

        critical_risk_count = db.scalar(
            select(
                func.count(
                    RiskResult.id
                )
            ).where(
                RiskResult.user_id
                == user_id,
                func.lower(
                    RiskResult.risk_level
                )
                == "critical",
            )
        ) or 0

        medium_risk_count = db.scalar(
            select(
                func.count(
                    RiskResult.id
                )
            ).where(
                RiskResult.user_id
                == user_id,
                func.lower(
                    RiskResult.risk_level
                )
                == "medium",
            )
        ) or 0

        low_risk_count = db.scalar(
            select(
                func.count(
                    RiskResult.id
                )
            ).where(
                RiskResult.user_id
                == user_id,
                func.lower(
                    RiskResult.risk_level
                )
                == "low",
            )
        ) or 0

        average_risk_score = db.scalar(
            select(
                func.avg(
                    RiskResult.risk_score
                )
            ).where(
                RiskResult.user_id
                == user_id
            )
        ) or 0

        highest_risk_score = db.scalar(
            select(
                func.max(
                    RiskResult.risk_score
                )
            ).where(
                RiskResult.user_id
                == user_id
            )
        ) or 0

        latest_result = db.scalars(
            select(
                RiskResult
            )
            .where(
                RiskResult.user_id
                == user_id
            )
            .order_by(
                RiskResult.created_at.desc()
            )
            .limit(1)
        ).first()

        recent_results = db.scalars(
            select(
                RiskResult
            )
            .where(
                RiskResult.user_id
                == user_id
            )
            .order_by(
                RiskResult.created_at.desc()
            )
            .limit(10)
        ).all()

        recent_signals: list[str] = []

        for result in recent_results:

            signals = getattr(
                result,
                "signals",
                None,
            )

            if isinstance(
                signals,
                list,
            ):

                for signal in signals:

                    normalized_signal = (
                        str(
                            signal
                        ).strip()
                    )

                    if (
                        normalized_signal
                        and normalized_signal
                        not in recent_signals
                    ):
                        recent_signals.append(
                            normalized_signal
                        )

        latest_model_version = (
            getattr(
                latest_result,
                "model_version",
                None,
            )
            if latest_result
            else None
        )

        latest_prediction_source = (
            getattr(
                latest_result,
                "prediction_source",
                None,
            )
            if latest_result
            else None
        )

        return {
            "total_predictions":
                int(
                    total_predictions
                ),
            "high_risk_count":
                int(
                    high_risk_count
                ),
            "critical_risk_count":
                int(
                    critical_risk_count
                ),
            "medium_risk_count":
                int(
                    medium_risk_count
                ),
            "low_risk_count":
                int(
                    low_risk_count
                ),
            "average_risk_score":
                round(
                    _normalize_risk_score(
                        average_risk_score
                    ),
                    2,
                ),
            "highest_risk_score":
                round(
                    _normalize_risk_score(
                        highest_risk_score
                    ),
                    2,
                ),
            "high_priority_signals":
                recent_signals[
                    :10
                ],
            "latest_model_version":
                (
                    str(
                        latest_model_version
                    )
                    if latest_model_version
                    else "unknown"
                ),
            "latest_prediction_source":
                (
                    str(
                        latest_prediction_source
                    )
                    if latest_prediction_source
                    else "unknown"
                ),
        }

    except Exception as exc:

        logger.exception(
            "Failed to build risk summary "
            "for user_id=%s",
            user_id,
        )

        raise RuntimeError(
            "Failed to build live risk summary."
        ) from exc


# ============================================================================
# RISK SUMMARY FOR SPECIFIC PAYMENT
# ============================================================================


def get_payment_risk_summary(
    db: Session,
    payment_id: str,
    user_id: int,
) -> dict[str, Any] | None:
    """
    Return a JSON-safe summary for one payment's latest risk result.
    """

    risk_result = get_latest_payment_risk(
        db=db,
        payment_id=payment_id,
        user_id=user_id,
    )

    if risk_result is None:
        return None

    risk_score = _normalize_risk_score(
        getattr(
            risk_result,
            "risk_score",
            0,
        )
    )

    risk_level = str(
        getattr(
            risk_result,
            "risk_level",
            None,
        )
        or _risk_level_from_score(
            risk_score
        )
    )

    probability_value = getattr(
        risk_result,
        "probability",
        None,
    )

    probability = (
        float(
            probability_value
        )
        if probability_value is not None
        else None
    )

    signals = getattr(
        risk_result,
        "signals",
        None,
    )

    if not isinstance(
        signals,
        list,
    ):
        signals = []

    return {
        "payment_id":
            str(
                payment_id
            ),
        "risk_score":
            round(
                risk_score,
                2,
            ),
        "risk_level":
            risk_level,
        "probability":
            probability,
        "model_version":
            _safe_text(
                getattr(
                    risk_result,
                    "model_version",
                    None,
                ),
                "unknown",
                200,
            ),
        "prediction_source":
            _safe_text(
                getattr(
                    risk_result,
                    "prediction_source",
                    None,
                ),
                "risk_predictor",
                200,
            ),
        "signals": [
            str(
                signal
            )
            for signal in signals
            if str(
                signal
            ).strip()
        ],
        "created_at": (
            getattr(
                risk_result,
                "created_at",
                None,
            ).isoformat()
            if getattr(
                risk_result,
                "created_at",
                None,
            )
            else None
        ),
    }