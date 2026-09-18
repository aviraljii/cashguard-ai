from __future__ import annotations

from decimal import Decimal
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from audit_service.service import log_audit_event
from banking_service.models import BankTransaction
from payment_service.models import Payment
from payment_service.models.reconciliation import PaymentReconciliation


# ==================================================================
# RECONCILIATION STATUS
# ==================================================================

RECONCILIATION_STATUSES = {
    "matched",
    "partially_matched",
    "unmatched",
    "duplicate",
    "exception",
}


# ==================================================================
# MATCHING CONFIGURATION
# ==================================================================

EXACT_AMOUNT_SCORE = Decimal("85")
REFERENCE_MATCH_SCORE = Decimal("10")
CUSTOMER_MATCH_SCORE = Decimal("5")
INVOICE_MATCH_SCORE = Decimal("5")

PARTIAL_AMOUNT_SCORE = Decimal("50")

MIN_PARTIAL_MATCH_SCORE = Decimal("50")
MIN_MATCH_SCORE = Decimal("80")

# Maximum number of bank transactions considered during
# automatic reconciliation.
MAX_CANDIDATES = 200


# ==================================================================
# HELPERS
# ==================================================================


def _clean_string(value: Any) -> str:
    if value is None:
        return ""

    return str(value).strip()


def _normalize_currency(value: str | None) -> str:
    if not value:
        return ""

    return str(value).strip().upper()


def _decimal(value: Any) -> Decimal:
    if value is None:
        return Decimal("0.00")

    if isinstance(value, Decimal):
        return value

    try:
        return Decimal(str(value).strip())
    except (TypeError, ValueError, ArithmeticError):
        return Decimal("0.00")


def _absolute_decimal(value: Any) -> Decimal:
    return abs(_decimal(value))


def _amount_difference(
    payment_amount: Decimal,
    transaction_amount: Decimal,
) -> Decimal:
    return abs(
        Decimal(payment_amount)
        - Decimal(transaction_amount)
    )


def _absolute_amount_difference(
    payment_amount: Decimal,
    transaction_amount: Decimal,
) -> Decimal:
    return abs(
        abs(Decimal(payment_amount))
        - abs(Decimal(transaction_amount))
    )


def _safe_lower(value: Any) -> str:
    return _clean_string(value).lower()


# ==================================================================
# PAYMENT REFERENCE SET
# ==================================================================


def _payment_reference_values(
    payment: Payment,
) -> set[str]:
    values = {
        _safe_lower(
            getattr(
                payment,
                "id",
                None,
            )
        ),
        _safe_lower(
            getattr(
                payment,
                "external_payment_id",
                None,
            )
        ),
        _safe_lower(
            getattr(
                payment,
                "provider_reference",
                None,
            )
        ),
        _safe_lower(
            getattr(
                payment,
                "idempotency_key",
                None,
            )
        ),
    }

    return {
        value
        for value in values
        if value
    }


# ==================================================================
# TRANSACTION REFERENCE VALUES
# ==================================================================


def _transaction_reference_values(
    transaction: BankTransaction,
) -> set[str]:
    values = {
        _safe_lower(
            getattr(
                transaction,
                "reference_number",
                None,
            )
        ),
        _safe_lower(
            getattr(
                transaction,
                "description",
                None,
            )
        ),
    }

    return {
        value
        for value in values
        if value
    }


# ==================================================================
# REFERENCE MATCH
# ==================================================================


def _has_reference_match(
    payment: Payment,
    transaction: BankTransaction,
) -> bool:
    payment_refs = _payment_reference_values(payment)
    transaction_refs = _transaction_reference_values(transaction)

    if not payment_refs or not transaction_refs:
        return False

    # Exact reference match.
    if payment_refs.intersection(transaction_refs):
        return True

    # Partial/reference containment.
    #
    # Example:
    # payment     = sandbox_abc123
    # transaction = Payment received: sandbox_abc123
    #
    for payment_ref in payment_refs:
        for transaction_ref in transaction_refs:
            if (
                payment_ref in transaction_ref
                or transaction_ref in payment_ref
            ):
                return True

    return False


# ==================================================================
# CUSTOMER MATCH
# ==================================================================


def _has_customer_match(
    payment: Payment,
    transaction: BankTransaction,
) -> bool:
    payment_customer_id = _clean_string(
        getattr(
            payment,
            "customer_id",
            None,
        )
    )

    transaction_customer_id = _clean_string(
        getattr(
            transaction,
            "customer_id",
            None,
        )
    )

    if (
        not payment_customer_id
        or not transaction_customer_id
    ):
        return False

    return (
        payment_customer_id
        == transaction_customer_id
    )


# ==================================================================
# INVOICE MATCH
# ==================================================================


def _has_invoice_match(
    payment: Payment,
    transaction: BankTransaction,
) -> bool:
    payment_invoice_id = _clean_string(
        getattr(
            payment,
            "invoice_id",
            None,
        )
    )

    transaction_invoice_payment_id = _clean_string(
        getattr(
            transaction,
            "invoice_payment_id",
            None,
        )
    )

    if (
        not payment_invoice_id
        or not transaction_invoice_payment_id
    ):
        return False

    return (
        payment_invoice_id
        == transaction_invoice_payment_id
    )


# ==================================================================
# AMOUNT MATCH
# ==================================================================


def _has_exact_amount_match(
    payment: Payment,
    transaction: BankTransaction,
) -> bool:
    payment_amount = _decimal(
        getattr(
            payment,
            "amount",
            None,
        )
    )

    transaction_amount = _decimal(
        getattr(
            transaction,
            "amount",
            None,
        )
    )

    # Handle normal same-sign values.
    if payment_amount == transaction_amount:
        return True

    # Bank feeds can represent a payment as either:
    #   5000
    # or
    #   -5000
    #
    # For reconciliation we compare the absolute value too.
    return (
        abs(payment_amount)
        == abs(transaction_amount)
    )


def _has_near_exact_amount_match(
    payment: Payment,
    transaction: BankTransaction,
) -> bool:
    payment_amount = _decimal(
        getattr(
            payment,
            "amount",
            None,
        )
    )

    transaction_amount = _decimal(
        getattr(
            transaction,
            "amount",
            None,
        )
    )

    return (
        _absolute_amount_difference(
            payment_amount,
            transaction_amount,
        )
        <= Decimal("0.01")
    )


# ==================================================================
# MATCH SCORE
# ==================================================================


def _calculate_match_score(
    payment: Payment,
    transaction: BankTransaction,
) -> Decimal:
    score = Decimal("0.00")

    # --------------------------------------------------------------
    # AMOUNT
    # --------------------------------------------------------------

    if _has_exact_amount_match(
        payment,
        transaction,
    ):
        score += EXACT_AMOUNT_SCORE

    elif _has_near_exact_amount_match(
        payment,
        transaction,
    ):
        score += PARTIAL_AMOUNT_SCORE

    # --------------------------------------------------------------
    # REFERENCE
    # --------------------------------------------------------------

    if _has_reference_match(
        payment,
        transaction,
    ):
        score += REFERENCE_MATCH_SCORE

    # --------------------------------------------------------------
    # CUSTOMER
    # --------------------------------------------------------------

    if _has_customer_match(
        payment,
        transaction,
    ):
        score += CUSTOMER_MATCH_SCORE

    # --------------------------------------------------------------
    # INVOICE
    # --------------------------------------------------------------

    if _has_invoice_match(
        payment,
        transaction,
    ):
        score += INVOICE_MATCH_SCORE

    return min(
        score,
        Decimal("100.00"),
    )


# ==================================================================
# STATUS DETERMINATION
# ==================================================================


def _determine_status(
    payment: Payment,
    transaction: BankTransaction,
    match_score: Decimal,
) -> str:
    if (
        _has_exact_amount_match(
            payment,
            transaction,
        )
        and match_score >= MIN_MATCH_SCORE
    ):
        return "matched"

    if (
        not _has_exact_amount_match(
            payment,
            transaction,
        )
        and match_score >= MIN_PARTIAL_MATCH_SCORE
    ):
        return "partially_matched"

    if match_score >= MIN_MATCH_SCORE:
        return "matched"

    return "unmatched"


# ==================================================================
# MATCH REASON
# ==================================================================


def _build_match_reason(
    payment: Payment,
    transaction: BankTransaction,
    match_score: Decimal,
    status: str,
) -> str:
    reasons: list[str] = []

    payment_amount = _decimal(
        getattr(
            payment,
            "amount",
            None,
        )
    )

    transaction_amount = _decimal(
        getattr(
            transaction,
            "amount",
            None,
        )
    )

    # --------------------------------------------------------------
    # AMOUNT
    # --------------------------------------------------------------

    if _has_exact_amount_match(
        payment,
        transaction,
    ):
        if payment_amount == transaction_amount:
            reasons.append(
                "exact amount match"
            )
        else:
            reasons.append(
                "amount match ignoring transaction sign"
            )

    elif _has_near_exact_amount_match(
        payment,
        transaction,
    ):
        reasons.append(
            "near-exact amount match"
        )

    else:
        reasons.append(
            "amount differs"
        )

    # --------------------------------------------------------------
    # REFERENCE
    # --------------------------------------------------------------

    if _has_reference_match(
        payment,
        transaction,
    ):
        reasons.append(
            "reference match"
        )

    # --------------------------------------------------------------
    # CUSTOMER
    # --------------------------------------------------------------

    if _has_customer_match(
        payment,
        transaction,
    ):
        reasons.append(
            "customer match"
        )

    # --------------------------------------------------------------
    # INVOICE
    # --------------------------------------------------------------

    if _has_invoice_match(
        payment,
        transaction,
    ):
        reasons.append(
            "invoice linkage match"
        )

    # --------------------------------------------------------------
    # PREFIX
    # --------------------------------------------------------------

    if status == "matched":
        prefix = (
            "Payment and bank transaction "
            "matched successfully"
        )

    elif status == "partially_matched":
        prefix = (
            "Payment and bank transaction "
            "partially matched"
        )

    elif status == "duplicate":
        prefix = (
            "Potential matching transaction "
            "is already reconciled"
        )

    else:
        prefix = (
            "Payment and bank transaction "
            "could not be confidently matched"
        )

    return (
        prefix
        + ". "
        + ", ".join(reasons)
        + f". Match score: {match_score}."
    )


# ==================================================================
# FIND CANDIDATE TRANSACTIONS
# ==================================================================


def find_candidate_transactions(
    db: Session,
    payment: Payment,
) -> list[BankTransaction]:
    """
    Find possible bank transactions for a payment.

    Matching is intentionally broader than the previous version.

    Supported candidate signals:
        - same absolute amount
        - customer linkage
        - invoice linkage

    Bank feeds commonly represent money movement with either
    positive or negative signs, so amount candidates are compared
    using ABS(amount).

    Reference/customer/invoice details are then evaluated in the
    scoring layer.
    """

    payment_amount = _absolute_decimal(
        getattr(
            payment,
            "amount",
            None,
        )
    )

    if payment_amount <= 0:
        return []

    payment_customer_id = _clean_string(
        getattr(
            payment,
            "customer_id",
            None,
        )
    )

    payment_invoice_id = _clean_string(
        getattr(
            payment,
            "invoice_id",
            None,
        )
    )

    # --------------------------------------------------------------
    # Candidate conditions
    #
    # We always include the absolute-amount condition.
    # Additional linkage conditions are OR conditions.
    # --------------------------------------------------------------

    conditions = [
        func.abs(
            BankTransaction.amount
        )
        == payment_amount
    ]

    if payment_customer_id:
        conditions.append(
            BankTransaction.customer_id
            == payment_customer_id
        )

    if payment_invoice_id:
        conditions.append(
            BankTransaction.invoice_payment_id
            == payment_invoice_id
        )

    statement = (
        select(
            BankTransaction
        )
        .where(
            or_(*conditions)
        )
        .order_by(
            BankTransaction.created_at.desc()
        )
        .limit(
            MAX_CANDIDATES
        )
    )

    try:
        return list(
            db.scalars(
                statement
            ).all()
        )

    except SQLAlchemyError as exc:
        print(
            "[RECONCILIATION] "
            "Candidate transaction query error:",
            repr(exc),
        )

        raise RuntimeError(
            "Failed to find banking reconciliation candidates."
        ) from exc


# ==================================================================
# CHECK EXISTING RECONCILIATION
# ==================================================================


def is_already_reconciled(
    db: Session,
    payment_id: str,
    transaction_id: str,
) -> bool:
    if not payment_id or not transaction_id:
        return False

    statement = select(
        PaymentReconciliation.id
    ).where(
        PaymentReconciliation.payment_id
        == payment_id,
        PaymentReconciliation.bank_transaction_id
        == transaction_id,
    )

    try:
        return (
            db.scalar(
                statement
            )
            is not None
        )

    except SQLAlchemyError as exc:
        print(
            "[RECONCILIATION] "
            "Existing reconciliation lookup error:",
            repr(exc),
        )

        raise RuntimeError(
            "Failed to check existing reconciliation."
        ) from exc


# ==================================================================
# CHECK TRANSACTION USED BY OTHER PAYMENT
# ==================================================================


def is_transaction_already_used(
    db: Session,
    transaction_id: str,
    exclude_payment_id: str | None = None,
) -> bool:
    statement = select(
        PaymentReconciliation.id
    ).where(
        PaymentReconciliation.bank_transaction_id
        == transaction_id
    )

    if exclude_payment_id:
        statement = statement.where(
            PaymentReconciliation.payment_id
            != exclude_payment_id
        )

    try:
        return (
            db.scalar(
                statement
            )
            is not None
        )

    except SQLAlchemyError as exc:
        print(
            "[RECONCILIATION] "
            "Transaction usage lookup error:",
            repr(exc),
        )

        raise RuntimeError(
            "Failed to check transaction reconciliation usage."
        ) from exc


# ==================================================================
# CREATE RECONCILIATION
# ==================================================================


def create_reconciliation(
    db: Session,
    payment: Payment,
    transaction: BankTransaction,
    match_score: Decimal,
    status: str,
    reason: str,
) -> PaymentReconciliation:
    if status not in RECONCILIATION_STATUSES:
        raise ValueError(
            f"Unsupported reconciliation status: {status}"
        )

    payment_amount = _decimal(
        getattr(
            payment,
            "amount",
            None,
        )
    )

    transaction_amount = _decimal(
        getattr(
            transaction,
            "amount",
            None,
        )
    )

    # matched_amount should represent the actual matched
    # monetary value, independent of bank transaction sign.
    matched_amount = min(
        abs(payment_amount),
        abs(transaction_amount),
    )

    reconciliation_metadata: dict[str, Any] = {
        "payment_external_id": getattr(
            payment,
            "external_payment_id",
            None,
        ),
        "payment_provider_reference": getattr(
            payment,
            "provider_reference",
            None,
        ),
        "payment_provider": getattr(
            payment,
            "provider",
            None,
        ),
        "transaction_reference_number": getattr(
            transaction,
            "reference_number",
            None,
        ),
        "transaction_category": getattr(
            transaction,
            "category",
            None,
        ),
        "transaction_description": getattr(
            transaction,
            "description",
            None,
        ),
        "transaction_business_id": getattr(
            transaction,
            "business_id",
            None,
        ),
        "payment_amount": str(
            payment_amount
        ),
        "transaction_amount": str(
            transaction_amount
        ),
        "absolute_amount_match": (
            abs(payment_amount)
            == abs(transaction_amount)
        ),
    }

    reconciliation = PaymentReconciliation(
        payment_id=payment.id,
        bank_transaction_id=transaction.id,
        status=status,
        matched_amount=matched_amount,
        payment_amount=payment_amount,
        transaction_amount=transaction_amount,
        currency=(
            _normalize_currency(
                getattr(
                    payment,
                    "currency",
                    None,
                )
            )
            or "INR"
        ),
        match_score=match_score,
        match_reason=reason,
        reconciliation_metadata=reconciliation_metadata,
    )

    try:
        db.add(reconciliation)
        db.commit()
        db.refresh(reconciliation)

    except IntegrityError as exc:
        db.rollback()

        raise ValueError(
            "This payment and bank transaction are already reconciled."
        ) from exc

    except SQLAlchemyError as exc:
        db.rollback()

        print(
            "[RECONCILIATION] "
            "Database error creating reconciliation:",
            repr(exc),
        )

        raise RuntimeError(
            "Failed to create reconciliation."
        ) from exc

    # --------------------------------------------------------------
    # AUDIT LOG
    # --------------------------------------------------------------

    try:
        log_audit_event(
            db,
            event_type="payment_reconciled",
            entity_type="payment_reconciliation",
            actor_user_id=getattr(
                payment,
                "user_id",
                None,
            ),
            entity_id=reconciliation.id,
            metadata={
                "payment_id": payment.id,
                "bank_transaction_id": transaction.id,
                "status": status,
                "match_score": float(
                    match_score
                ),
            },
        )

    except Exception as exc:
        print(
            "[RECONCILIATION] "
            "Audit logging error:",
            repr(exc),
        )

    return reconciliation


# ==================================================================
# RECONCILE SINGLE PAYMENT
# ==================================================================


def reconcile_payment(
    db: Session,
    payment: Payment,
) -> PaymentReconciliation | None:
    if payment is None:
        raise ValueError(
            "Payment is required."
        )

    candidates = find_candidate_transactions(
        db,
        payment,
    )

    if not candidates:
        print(
            "[RECONCILIATION] "
            f"No candidate transaction found for payment {payment.id}"
        )
        return None

    best_transaction: BankTransaction | None = None
    best_score = Decimal("0.00")
    best_status = "unmatched"

    # --------------------------------------------------------------
    # Evaluate all candidates
    # --------------------------------------------------------------

    for transaction in candidates:

        # Same payment + same transaction already reconciled.
        if is_already_reconciled(
            db,
            str(payment.id),
            str(transaction.id),
        ):
            continue

        score = _calculate_match_score(
            payment,
            transaction,
        )

        status = _determine_status(
            payment,
            transaction,
            score,
        )

        transaction_used = (
            is_transaction_already_used(
                db,
                str(transaction.id),
                exclude_payment_id=str(
                    payment.id
                ),
            )
        )

        # ----------------------------------------------------------
        # Already used by another payment
        # ----------------------------------------------------------

        if transaction_used:
            # Keep the transaction as a duplicate candidate if
            # there is no better valid transaction.
            if (
                best_transaction is None
                and score >= MIN_PARTIAL_MATCH_SCORE
            ):
                best_transaction = transaction
                best_score = score
                best_status = "duplicate"

            continue

        # ----------------------------------------------------------
        # Best normal candidate
        # ----------------------------------------------------------

        if (
            best_transaction is None
            or score > best_score
        ):
            best_transaction = transaction
            best_score = score
            best_status = status

    # --------------------------------------------------------------
    # Nothing eligible
    # --------------------------------------------------------------

    if best_transaction is None:
        print(
            "[RECONCILIATION] "
            f"No eligible transaction for payment {payment.id}"
        )
        return None

    # --------------------------------------------------------------
    # Duplicate protection
    # --------------------------------------------------------------

    if best_status == "duplicate":
        reason = (
            "A suitable bank transaction was found, "
            "but it is already linked to another "
            "payment reconciliation."
        )

    else:
        best_status = _determine_status(
            payment,
            best_transaction,
            best_score,
        )

        reason = _build_match_reason(
            payment,
            best_transaction,
            best_score,
            best_status,
        )

    return create_reconciliation(
        db=db,
        payment=payment,
        transaction=best_transaction,
        match_score=best_score,
        status=best_status,
        reason=reason,
    )


# ==================================================================
# RECONCILE PAYMENT BY ID
# ==================================================================


def reconcile_payment_by_id(
    db: Session,
    payment_id: str,
    user_id: int,
) -> PaymentReconciliation | None:
    cleaned_payment_id = _clean_string(
        payment_id
    )

    if not cleaned_payment_id:
        return None

    # --------------------------------------------------------------
    # Normalize user id
    # --------------------------------------------------------------

    try:
        normalized_user_id = int(
            str(user_id).strip()
        )

    except (
        TypeError,
        ValueError,
    ):
        return None

    if normalized_user_id <= 0:
        return None

    # --------------------------------------------------------------
    # Load payment belonging to authenticated user
    # --------------------------------------------------------------

    try:
        payment = db.scalar(
            select(
                Payment
            ).where(
                Payment.id
                == cleaned_payment_id,
                Payment.user_id
                == normalized_user_id,
            )
        )

    except SQLAlchemyError as exc:
        print(
            "[RECONCILIATION] "
            "Payment lookup error:",
            repr(exc),
        )

        raise RuntimeError(
            "Failed to load payment for reconciliation."
        ) from exc

    if payment is None:
        print(
            "[RECONCILIATION] "
            f"Payment {cleaned_payment_id} "
            f"was not found for user {normalized_user_id}"
        )

        return None

    # --------------------------------------------------------------
    # Reconcile payment
    # --------------------------------------------------------------

    return reconcile_payment(
        db,
        payment,
    )


# ==================================================================
# LIST USER RECONCILIATIONS
# ==================================================================


def list_reconciliations(
    db: Session,
    user_id: int,
    limit: int = 50,
    offset: int = 0,
) -> list[PaymentReconciliation]:
    try:
        normalized_user_id = int(
            str(user_id).strip()
        )

    except (
        TypeError,
        ValueError,
    ) as exc:
        raise ValueError(
            "user_id must be a valid integer."
        ) from exc

    if normalized_user_id <= 0:
        raise ValueError(
            "user_id must be greater than zero."
        )

    # --------------------------------------------------------------
    # Pagination
    # --------------------------------------------------------------

    try:
        safe_limit = int(
            str(limit).strip()
        )

    except (
        TypeError,
        ValueError,
    ):
        safe_limit = 50

    try:
        safe_offset = int(
            str(offset).strip()
        )

    except (
        TypeError,
        ValueError,
    ):
        safe_offset = 0

    safe_limit = max(
        1,
        min(
            safe_limit,
            100,
        ),
    )

    safe_offset = max(
        0,
        safe_offset,
    )

    # --------------------------------------------------------------
    # Query
    # --------------------------------------------------------------

    statement = (
        select(
            PaymentReconciliation
        )
        .join(
            Payment,
            Payment.id
            == PaymentReconciliation.payment_id,
        )
        .where(
            Payment.user_id
            == normalized_user_id
        )
        .order_by(
            PaymentReconciliation.created_at.desc()
        )
        .limit(
            safe_limit
        )
        .offset(
            safe_offset
        )
    )

    try:
        return list(
            db.scalars(
                statement
            ).all()
        )

    except SQLAlchemyError as exc:
        print(
            "[RECONCILIATION] "
            "Reconciliation list error:",
            repr(exc),
        )

        raise RuntimeError(
            "Failed to load reconciliations."
        ) from exc