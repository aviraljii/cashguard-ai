from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from banking_service.models import (
    BankTransaction,
)

from payment_service.models import (
    Payment,
)


# ------------------------------------------------------------------
# FEATURE DEFAULTS
# ------------------------------------------------------------------

DEFAULT_TRANSACTION_COUNT = 0
DEFAULT_FAILED_PAYMENT_COUNT = 0
DEFAULT_TOTAL_PAYMENT_AMOUNT = Decimal("0.00")
DEFAULT_AVERAGE_PAYMENT_AMOUNT = Decimal("0.00")
DEFAULT_TRANSACTION_VELOCITY = Decimal("0.00")


# ------------------------------------------------------------------
# SAFE DECIMAL
# ------------------------------------------------------------------

def _to_decimal(
    value: Decimal | int | float | None,
) -> Decimal:
    if value is None:
        return Decimal("0.00")

    return Decimal(str(value))


# ------------------------------------------------------------------
# PAYMENT HISTORY
# ------------------------------------------------------------------

def get_payment_history_features(
    db: Session,
    user_id: int,
) -> dict[str, Decimal | int]:
    total_payment_count = db.scalar(
        select(
            func.count(Payment.id)
        ).where(
            Payment.user_id == user_id
        )
    ) or 0

    total_payment_amount = db.scalar(
        select(
            func.coalesce(
                func.sum(Payment.amount),
                0,
            )
        ).where(
            Payment.user_id == user_id,
            Payment.status == "completed",
        )
    )

    failed_payment_count = db.scalar(
        select(
            func.count(Payment.id)
        ).where(
            Payment.user_id == user_id,
            Payment.status == "failed",
        )
    ) or 0

    completed_payment_count = db.scalar(
        select(
            func.count(Payment.id)
        ).where(
            Payment.user_id == user_id,
            Payment.status == "completed",
        )
    ) or 0

    average_payment_amount = Decimal("0.00")

    if completed_payment_count > 0:
        average_payment_amount = (
            _to_decimal(total_payment_amount)
            / Decimal(completed_payment_count)
        )

    return {
        "total_payment_count": int(
            total_payment_count
        ),
        "completed_payment_count": int(
            completed_payment_count
        ),
        "failed_payment_count": int(
            failed_payment_count
        ),
        "total_completed_payment_amount": (
            _to_decimal(total_payment_amount)
        ),
        "average_completed_payment_amount": (
            average_payment_amount
        ),
    }


# ------------------------------------------------------------------
# TRANSACTION HISTORY
# ------------------------------------------------------------------

def get_transaction_history_features(
    db: Session,
    account_id: str | None,
) -> dict[str, Decimal | int]:
    if not account_id:
        return {
            "transaction_count": 0,
            "total_transaction_amount": Decimal("0.00"),
            "average_transaction_amount": Decimal("0.00"),
            "recent_transaction_count": 0,
        }

    transaction_count = db.scalar(
        select(
            func.count(BankTransaction.id)
        ).where(
            BankTransaction.account_id
            == account_id
        )
    ) or 0

    total_transaction_amount = db.scalar(
        select(
            func.coalesce(
                func.sum(
                    BankTransaction.amount
                ),
                0,
            )
        ).where(
            BankTransaction.account_id
            == account_id
        )
    )

    average_transaction_amount = Decimal("0.00")

    if transaction_count > 0:
        average_transaction_amount = (
            _to_decimal(
                total_transaction_amount
            )
            / Decimal(transaction_count)
        )

    now = datetime.now(timezone.utc)

    recent_cutoff = now - timedelta(
        hours=24
    )

    recent_transaction_count = db.scalar(
        select(
            func.count(BankTransaction.id)
        ).where(
            BankTransaction.account_id
            == account_id,
            BankTransaction.transaction_date
            >= recent_cutoff,
        )
    ) or 0

    return {
        "transaction_count": int(
            transaction_count
        ),
        "total_transaction_amount": (
            _to_decimal(
                total_transaction_amount
            )
        ),
        "average_transaction_amount": (
            average_transaction_amount
        ),
        "recent_transaction_count": int(
            recent_transaction_count
        ),
    }


# ------------------------------------------------------------------
# CURRENT PAYMENT FEATURES
# ------------------------------------------------------------------

def build_payment_features(
    db: Session,
    payment: Payment,
) -> dict[str, Decimal | int | str]:
    payment_amount = _to_decimal(
        payment.amount
    )

    payment_history = (
        get_payment_history_features(
            db,
            payment.user_id,
        )
    )

    transaction_history = (
        get_transaction_history_features(
            db,
            payment.account_id,
        )
    )

    average_payment_amount = _to_decimal(
        payment_history[
            "average_completed_payment_amount"
        ]
    )

    amount_deviation_ratio = Decimal("0.00")

    if average_payment_amount > 0:
        amount_deviation_ratio = (
            abs(
                payment_amount
                - average_payment_amount
            )
            / average_payment_amount
        )

    transaction_velocity = Decimal(
        str(
            transaction_history[
                "recent_transaction_count"
            ]
        )
    )

    failed_payment_count = int(
        payment_history[
            "failed_payment_count"
        ]
    )

    transaction_count = int(
        transaction_history[
            "transaction_count"
        ]
    )

    failed_payment_ratio = Decimal("0.00")

    if (
        payment_history[
            "total_payment_count"
        ]
        > 0
    ):
        failed_payment_ratio = (
            Decimal(
                failed_payment_count
            )
            / Decimal(
                payment_history[
                    "total_payment_count"
                ]
            )
        )

    return {
        "payment_amount": payment_amount,
        "average_payment_amount": average_payment_amount,
        "amount_deviation_ratio": amount_deviation_ratio,
        "failed_payment_count": failed_payment_count,
        "failed_payment_ratio": failed_payment_ratio,
        "transaction_count": transaction_count,
        "transaction_velocity_24h": transaction_velocity,
        "recent_transaction_count": int(
            transaction_history[
                "recent_transaction_count"
            ]
        ),
        "currency": payment.currency,
        "payment_status": payment.status,
        "payment_provider": payment.provider,
    }


# ------------------------------------------------------------------
# ML FEATURE VECTOR
# ------------------------------------------------------------------

def build_ml_feature_vector(
    db: Session,
    payment: Payment,
) -> dict[str, float]:
    features = build_payment_features(
        db,
        payment,
    )

    return {
        "payment_amount": float(
            features["payment_amount"]
        ),
        "average_payment_amount": float(
            features["average_payment_amount"]
        ),
        "amount_deviation_ratio": float(
            features[
                "amount_deviation_ratio"
            ]
        ),
        "failed_payment_count": float(
            features[
                "failed_payment_count"
            ]
        ),
        "failed_payment_ratio": float(
            features[
                "failed_payment_ratio"
            ]
        ),
        "transaction_count": float(
            features[
                "transaction_count"
            ]
        ),
        "transaction_velocity_24h": float(
            features[
                "transaction_velocity_24h"
            ]
        ),
        "recent_transaction_count": float(
            features[
                "recent_transaction_count"
            ]
        ),
    }