from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from audit_service.service import log_audit_event

from banking_service.models import (
    BankAccount,
    BankTransaction,
    BankingWebhookEvent,
)

from banking_service.schemas import BankAccountCreate


# ==================================================================
# HELPERS
# ==================================================================


def _decimal(value: Any) -> Decimal:
    """
    Safely convert a value to Decimal.

    Invalid or missing values are treated as 0.00.
    """

    if value is None:
        return Decimal("0.00")

    if isinstance(value, Decimal):
        return value

    try:
        return Decimal(str(value).strip())
    except (
        InvalidOperation,
        ValueError,
        TypeError,
        ArithmeticError,
    ):
        return Decimal("0.00")


def _clean_business_id(business_id: Any) -> str:
    """
    Normalize and validate business ID.
    """

    cleaned = str(business_id or "").strip()

    if not cleaned:
        raise ValueError("business_id is required.")

    return cleaned


def _clean_required_string(
    value: Any,
    field_name: str,
) -> str:
    """
    Normalize and validate required strings.
    """

    cleaned = str(value or "").strip()

    if not cleaned:
        raise ValueError(
            f"{field_name} is required."
        )

    return cleaned


def _clean_optional_string(
    value: Any,
) -> str | None:
    """
    Normalize an optional string.

    Empty strings become None.
    """

    if value is None:
        return None

    cleaned = str(value).strip()

    return cleaned or None


def _safe_positive_int(
    value: Any,
    default: int,
    minimum: int = 0,
    maximum: int | None = None,
) -> int:
    """
    Safely normalize an integer value.
    """

    try:
        result = int(str(value).strip())
    except (
        TypeError,
        ValueError,
    ):
        result = default

    if result < minimum:
        result = minimum

    if maximum is not None and result > maximum:
        result = maximum

    return result


def _parse_transaction_date(value: Any) -> date:
    """
    Convert supported transaction-date values to date.

    Supported:
      - datetime
      - date
      - ISO datetime string
      - ISO date string
    """

    if isinstance(value, datetime):
        return value.date()

    if isinstance(value, date):
        return value

    raw = str(value or "").strip()

    if not raw:
        raise ValueError(
            "transaction_date is required."
        )

    # ISO datetime
    try:
        parsed_datetime = datetime.fromisoformat(
            raw.replace("Z", "+00:00")
        )
        return parsed_datetime.date()
    except ValueError:
        pass

    # ISO date
    try:
        return date.fromisoformat(raw)
    except ValueError as exc:
        raise ValueError(
            "Invalid transaction_date."
        ) from exc


def _normalize_transaction_type(value: Any) -> str:
    """
    Normalize transaction type.
    """

    return (
        str(value or "")
        .strip()
        .lower()
    )


def _is_credit_transaction(value: Any) -> bool:
    """
    Return True when transaction represents money coming in.
    """

    normalized = _normalize_transaction_type(value)

    return normalized in {
        "credit",
        "cr",
        "income",
        "deposit",
        "inflow",
        "received",
        "receive",
        "paid_in",
    }


def _is_debit_transaction(value: Any) -> bool:
    """
    Return True when transaction represents money going out.
    """

    normalized = _normalize_transaction_type(value)

    return normalized in {
        "debit",
        "dr",
        "expense",
        "withdrawal",
        "outflow",
        "paid",
        "payment",
    }


# ==================================================================
# BANK ACCOUNT
# ==================================================================


def create_account(
    db: Session,
    user_id: int,
    payload: BankAccountCreate,
) -> BankAccount:
    """
    Create and connect a bank account
    for the authenticated user.
    """

    if user_id is None:
        raise ValueError(
            "user_id is required."
        )

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

    if payload is None:
        raise ValueError(
            "Bank account payload is required."
        )

    try:
        payload_data = payload.model_dump()
    except AttributeError as exc:
        raise ValueError(
            "Invalid bank account payload."
        ) from exc

    account = BankAccount(
        user_id=normalized_user_id,
        **payload_data,
    )

    try:
        db.add(account)
        db.commit()
        db.refresh(account)

    except IntegrityError as exc:
        db.rollback()

        raise ValueError(
            "This provider account is already connected."
        ) from exc

    except SQLAlchemyError as exc:
        db.rollback()

        print(
            "[BANKING] Account database error:",
            repr(exc),
        )

        raise RuntimeError(
            "Failed to create banking account."
        ) from exc

    # Audit failure must not invalidate
    # an already successful DB insert.
    try:
        log_audit_event(
            db,
            event_type="bank_account_connected",
            entity_type="bank_account",
            actor_user_id=normalized_user_id,
            entity_id=account.id,
        )
    except Exception as exc:
        print(
            "[BANKING] Account audit error:",
            repr(exc),
        )

    return account


# ==================================================================
# LIST CONNECTED ACCOUNTS
# ==================================================================


def list_accounts(
    db: Session,
    user_id: int,
) -> list[BankAccount]:
    """
    Return all bank accounts belonging
    to the authenticated user.
    """

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

    statement = (
        select(BankAccount)
        .where(
            BankAccount.user_id
            == normalized_user_id
        )
        .order_by(
            BankAccount.created_at.desc()
        )
    )

    try:
        result = db.scalars(statement)

        return list(result.all())

    except SQLAlchemyError as exc:
        print(
            "[BANKING] Account list database error:",
            repr(exc),
        )

        raise RuntimeError(
            "Failed to load connected banking accounts."
        ) from exc


# ==================================================================
# LEGACY ACCOUNT-SPECIFIC TRANSACTIONS
# ==================================================================


def list_transactions(
    db: Session,
    account_id: str,
    user_id: int,
    limit: int,
    offset: int,
) -> list[BankTransaction]:
    """
    Legacy account-specific transaction function.

    Current bank_transactions table is business-based
    and does not contain account_id.

    The account ownership is still validated.
    """

    cleaned_account_id = str(
        account_id or ""
    ).strip()

    if not cleaned_account_id:
        raise ValueError(
            "account_id is required."
        )

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

    safe_limit = _safe_positive_int(
        limit,
        default=50,
        minimum=1,
        maximum=100,
    )

    safe_offset = _safe_positive_int(
        offset,
        default=0,
        minimum=0,
    )

    try:
        account = db.scalar(
            select(BankAccount).where(
                BankAccount.id
                == cleaned_account_id,
                BankAccount.user_id
                == normalized_user_id,
            )
        )
    except SQLAlchemyError as exc:
        print(
            "[BANKING] Legacy account lookup error:",
            repr(exc),
        )

        raise RuntimeError(
            "Failed to validate banking account."
        ) from exc

    if account is None:
        raise LookupError(
            "Bank account not found."
        )

    # Current schema does not support account_id
    # on bank_transactions.
    _ = safe_limit
    _ = safe_offset

    return []


# ==================================================================
# BUSINESS TRANSACTIONS
# ==================================================================


def list_business_transactions(
    db: Session,
    business_id: str,
    limit: int = 50,
    offset: int = 0,
) -> list[BankTransaction]:
    """
    Return paginated bank transactions
    for a business.
    """

    cleaned_business_id = _clean_business_id(
        business_id
    )

    safe_limit = _safe_positive_int(
        limit,
        default=50,
        minimum=1,
        maximum=100,
    )

    safe_offset = _safe_positive_int(
        offset,
        default=0,
        minimum=0,
    )

    statement = (
        select(BankTransaction)
        .where(
            BankTransaction.business_id
            == cleaned_business_id
        )
        .order_by(
            BankTransaction.transaction_date.desc(),
            BankTransaction.created_at.desc(),
        )
        .limit(safe_limit)
        .offset(safe_offset)
    )

    try:
        result = db.scalars(statement)

        return list(result.all())

    except SQLAlchemyError as exc:
        print(
            "[BANKING] Transaction query database error:",
            repr(exc),
        )

        raise RuntimeError(
            "Failed to load banking transactions."
        ) from exc


# ==================================================================
# TRANSACTION SUMMARY
# ==================================================================


def get_transaction_summary(
    db: Session,
    business_id: str,
) -> dict[str, Any]:
    """
    Calculate banking KPIs directly from bank_transactions.
    """

    cleaned_business_id = _clean_business_id(
        business_id
    )

    statement = (
        select(BankTransaction)
        .where(
            BankTransaction.business_id
            == cleaned_business_id
        )
        .order_by(
            BankTransaction.transaction_date.desc(),
            BankTransaction.created_at.desc(),
        )
    )

    try:
        result = db.scalars(statement)

        transactions = list(result.all())

    except SQLAlchemyError as exc:
        print(
            "[BANKING] Summary database error:",
            repr(exc),
        )

        raise RuntimeError(
            "Failed to calculate banking summary."
        ) from exc

    total_transactions = len(
        transactions
    )

    total_credit = Decimal("0.00")
    total_debit = Decimal("0.00")

    for transaction in transactions:
        amount = abs(
            _decimal(
                transaction.amount
            )
        )

        transaction_type = (
            transaction.transaction_type
        )

        if _is_credit_transaction(
            transaction_type
        ):
            total_credit += amount

        elif _is_debit_transaction(
            transaction_type
        ):
            total_debit += amount

    latest_transaction = (
        transactions[0]
        if transactions
        else None
    )

    current_balance = (
        _decimal(
            latest_transaction.running_balance
        )
        if latest_transaction is not None
        else Decimal("0.00")
    )

    return {
        "total_transactions": total_transactions,
        "total_credit": float(total_credit),
        "total_debit": float(total_debit),
        "balance": float(current_balance),
    }


# ==================================================================
# PERSIST WEBHOOK EVENT
# ==================================================================


def persist_webhook_event(
    db: Session,
    provider: str,
    event_id: str,
    event_type: str,
    payload: dict[str, Any],
) -> bool:
    """
    Persist a banking webhook event.

    Returns:
        True  = new event accepted
        False = duplicate event
    """

    cleaned_event_id = _clean_required_string(
        event_id,
        "event_id",
    )

    cleaned_provider = (
        str(provider or "")
        .strip()
        .lower()
    )

    if not cleaned_provider:
        raise ValueError(
            "provider is required."
        )

    cleaned_event_type = _clean_required_string(
        event_type,
        "event_type",
    )

    if not isinstance(payload, dict):
        raise ValueError(
            "payload must be a valid object."
        )

    event = BankingWebhookEvent(
        provider=cleaned_provider,
        external_event_id=cleaned_event_id,
        event_type=cleaned_event_type,
        payload=payload,
    )

    try:
        db.add(event)
        db.commit()
        db.refresh(event)

    except IntegrityError:
        db.rollback()

        return False

    except SQLAlchemyError as exc:
        db.rollback()

        print(
            "[BANKING] Webhook database error:",
            repr(exc),
        )

        raise RuntimeError(
            "Failed to persist banking webhook event."
        ) from exc

    try:
        log_audit_event(
            db,
            event_type="webhook_received",
            entity_type="banking_webhook",
            entity_id=event.id,
            metadata={
                "provider": cleaned_provider,
                "event_type": cleaned_event_type,
            },
        )
    except Exception as exc:
        print(
            "[BANKING] Webhook audit error:",
            repr(exc),
        )

    return True


# ==================================================================
# NORMALIZE TRANSACTION WEBHOOK
# ==================================================================


def normalize_transaction_event(
    db: Session,
    provider: str,
    event_type: str,
    payload: dict[str, Any],
) -> None:
    """
    Normalize a transaction.created webhook event
    and persist it into bank_transactions.
    """

    cleaned_event_type = (
        str(event_type or "")
        .strip()
        .lower()
    )

    cleaned_provider = (
        str(provider or "")
        .strip()
        .lower()
    )

    if not cleaned_provider:
        raise ValueError(
            "provider is required."
        )

    # Ignore unsupported events.
    if cleaned_event_type != "transaction.created":
        return

    if not isinstance(payload, dict):
        raise ValueError(
            "Webhook payload must be a valid object."
        )

    data = payload.get("data")

    if not isinstance(data, dict):
        raise ValueError(
            "Webhook transaction payload is invalid."
        )

    # --------------------------------------------------------------
    # Required fields
    # --------------------------------------------------------------

    required_fields = {
        "business_id",
        "transaction_id",
        "transaction_date",
        "transaction_type",
        "category",
        "amount",
        "running_balance",
        "description",
    }

    missing_fields = sorted(
        required_fields.difference(
            data.keys()
        )
    )

    if missing_fields:
        raise ValueError(
            "Webhook transaction payload is missing "
            "required fields: "
            + ", ".join(missing_fields)
        )

    # --------------------------------------------------------------
    # Business + transaction IDs
    # --------------------------------------------------------------

    business_id = _clean_required_string(
        data.get("business_id"),
        "business_id",
    )

    transaction_id = _clean_required_string(
        data.get("transaction_id"),
        "transaction_id",
    )

    # --------------------------------------------------------------
    # Reference number
    # --------------------------------------------------------------

    raw_reference = data.get(
        "reference_number"
    )

    reference_number = (
        str(raw_reference).strip()
        if raw_reference is not None
        else transaction_id
    )

    if not reference_number:
        reference_number = transaction_id

    # --------------------------------------------------------------
    # Duplicate transaction protection
    # --------------------------------------------------------------

    try:
        existing = db.scalar(
            select(BankTransaction)
            .where(
                BankTransaction.business_id
                == business_id,
                BankTransaction.reference_number
                == reference_number,
            )
            .limit(1)
        )

    except SQLAlchemyError as exc:
        print(
            "[BANKING] Duplicate transaction lookup error:",
            repr(exc),
        )

        raise RuntimeError(
            "Failed to check duplicate banking transaction."
        ) from exc

    if existing is not None:
        return

    # --------------------------------------------------------------
    # Transaction date
    # --------------------------------------------------------------

    parsed_transaction_date = (
        _parse_transaction_date(
            data.get(
                "transaction_date"
            )
        )
    )

    # --------------------------------------------------------------
    # Related IDs
    # --------------------------------------------------------------

    customer_id = _clean_optional_string(
        data.get("customer_id")
    )

    supplier_id = _clean_optional_string(
        data.get("supplier_id")
    )

    invoice_payment_id = _clean_optional_string(
        data.get("invoice_payment_id")
    )

    expense_id = _clean_optional_string(
        data.get("expense_id")
    )

    # --------------------------------------------------------------
    # Amounts
    # --------------------------------------------------------------

    try:
        amount = Decimal(
            str(
                data.get("amount")
            ).strip()
        )

        running_balance = Decimal(
            str(
                data.get("running_balance")
            ).strip()
        )

    except (
        InvalidOperation,
        ValueError,
        TypeError,
        ArithmeticError,
    ) as exc:
        raise ValueError(
            "Invalid amount or running_balance "
            "in webhook payload."
        ) from exc

    # --------------------------------------------------------------
    # Transaction fields
    # --------------------------------------------------------------

    transaction_type = _clean_required_string(
        data.get("transaction_type"),
        "transaction_type",
    )

    category = _clean_required_string(
        data.get("category"),
        "category",
    )

    description = _clean_required_string(
        data.get("description"),
        "description",
    )

    # --------------------------------------------------------------
    # Create transaction
    # --------------------------------------------------------------

    transaction = BankTransaction(
        id=str(uuid.uuid4()),
        business_id=business_id,
        transaction_date=parsed_transaction_date,
        transaction_type=transaction_type,
        category=category,
        amount=amount,
        running_balance=running_balance,
        description=description,
        reference_number=reference_number,
        customer_id=customer_id,
        supplier_id=supplier_id,
        invoice_payment_id=invoice_payment_id,
        expense_id=expense_id,
        created_at=datetime.now(timezone.utc),
    )

    # --------------------------------------------------------------
    # Persist
    # --------------------------------------------------------------

    try:
        db.add(transaction)
        db.commit()
        db.refresh(transaction)

    except IntegrityError:
        db.rollback()

        # Concurrent duplicate is safely ignored.
        return

    except SQLAlchemyError as exc:
        db.rollback()

        print(
            "[BANKING] Transaction insert database error:",
            repr(exc),
        )

        raise RuntimeError(
            "Failed to persist banking transaction."
        ) from exc

    # --------------------------------------------------------------
    # Audit
    # --------------------------------------------------------------

    try:
        log_audit_event(
            db,
            event_type="bank_transaction_created",
            entity_type="bank_transaction",
            entity_id=transaction.id,
            metadata={
                "provider": cleaned_provider,
                "business_id": business_id,
                "transaction_type": transaction.transaction_type,
                "amount": float(amount),
                "reference_number": reference_number,
            },
        )

    except Exception as exc:
        print(
            "[BANKING] Transaction audit error:",
            repr(exc),
        )