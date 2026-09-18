from __future__ import annotations

import json
import logging
import os
import time

from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request as UrlRequest
from urllib.request import urlopen

from sqlalchemy import text

from auth_service.database import engine

from admin_service.schemas import (
    AdminAlertResponse,
    AdminSummary,
    AdminUserResponse,
    AIInsightResponse,
    AIModelResponse,
    AIStatusResponse,
    AuditLogResponse,
    BusinessAdminResponse,
    DataQualityResponse,
    MLStatusResponse,
    PlatformHealthResponse,
    ServiceHealthResponse,
    TransactionAnomalyResponse,
)


# ============================================================================
# LOGGER
# ============================================================================

logger = logging.getLogger("cashguard.admin.service")


# ============================================================================
# PATHS
# ============================================================================

BACKEND_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = BACKEND_ROOT.parent

ML_ROOT = PROJECT_ROOT / "ml"
ML_MODELS_DIR = ML_ROOT / "models"

PAYMENT_DELAY_MODEL = (
    ML_MODELS_DIR / "payment_delay_risk_model.joblib"
)

PAYMENT_DELAY_METADATA = (
    ML_MODELS_DIR / "payment_delay_model_metadata.json"
)

CASH_FLOW_MODEL = (
    ML_MODELS_DIR / "cash_flow_forecast_model.joblib"
)

CASH_FLOW_METADATA = (
    ML_MODELS_DIR / "cash_flow_forecast_metadata.json"
)


# ============================================================================
# GENERAL HELPERS
# ============================================================================

def serialize_value(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)

    if isinstance(value, (datetime, date)):
        return value.isoformat()

    return value


def serialize_row(row: Any) -> dict[str, Any]:
    if row is None:
        return {}

    return {
        str(key): serialize_value(value)
        for key, value in row._mapping.items()
    }


def clean_string(
    value: Any,
    fallback: str = "",
) -> str:
    if value is None:
        return fallback

    result = str(value).strip()

    return result or fallback


def nullable_string(value: Any) -> str | None:
    result = clean_string(value)

    return result or None


def first_present(
    row: dict[str, Any],
    *keys: str,
    default: Any = None,
) -> Any:
    for key in keys:
        if key not in row:
            continue

        value = row[key]

        if value is not None:
            return value

    return default


def to_float(value: Any) -> float:
    if value is None:
        return 0.0

    if isinstance(value, Decimal):
        return float(value)

    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def to_int(value: Any) -> int:
    if value is None:
        return 0

    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def to_bool(
    value: Any,
    default: bool = False,
) -> bool:
    if value is None:
        return default

    if isinstance(value, bool):
        return value

    if isinstance(value, (int, float)):
        return value != 0

    normalized = str(value).strip().lower()

    if normalized in {
        "true",
        "1",
        "yes",
        "active",
        "enabled",
        "on",
    }:
        return True

    if normalized in {
        "false",
        "0",
        "no",
        "inactive",
        "disabled",
        "off",
    }:
        return False

    return default


def now_iso() -> str:
    return datetime.now().astimezone().isoformat()


def safe_json_load(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}

    try:
        raw = path.read_text(encoding="utf-8")
        value = json.loads(raw)

        if isinstance(value, dict):
            return value

    except (OSError, json.JSONDecodeError):
        logger.warning(
            "Unable to read JSON metadata file: %s",
            path,
        )

    return {}


def model_to_dict(value: Any) -> dict[str, Any]:
    if value is None:
        return {}

    if hasattr(value, "model_dump"):
        return value.model_dump()

    if hasattr(value, "dict"):
        return value.dict()

    if isinstance(value, dict):
        return value

    return {}


# ============================================================================
# DATABASE INTROSPECTION
# ============================================================================

def table_exists(
    connection: Any,
    table_name: str,
) -> bool:
    result = connection.execute(
        text(
            """
            SELECT COUNT(*)
            FROM information_schema.tables
            WHERE table_schema = DATABASE()
              AND table_name = :table_name
            """
        ),
        {
            "table_name": table_name,
        },
    )

    return int(result.scalar() or 0) > 0


def get_table_columns(
    connection: Any,
    table_name: str,
) -> set[str]:
    if not table_exists(connection, table_name):
        return set()

    result = connection.execute(
        text(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = DATABASE()
              AND table_name = :table_name
            """
        ),
        {
            "table_name": table_name,
        },
    )

    return {
        str(row[0])
        for row in result.fetchall()
    }


def count_table(
    connection: Any,
    table_name: str,
    where: str | None = None,
    params: dict[str, Any] | None = None,
) -> int:
    if not table_exists(connection, table_name):
        return 0

    query = f"SELECT COUNT(*) FROM `{table_name}`"

    if where:
        query += f" WHERE {where}"

    result = connection.execute(
        text(query),
        params or {},
    )

    return int(result.scalar() or 0)


def fetch_table_rows(
    connection: Any,
    table_name: str,
    limit: int = 100,
    offset: int = 0,
    order_column: str | None = None,
) -> list[dict[str, Any]]:
    if not table_exists(connection, table_name):
        return []

    columns = get_table_columns(
        connection,
        table_name,
    )

    safe_limit = max(
        1,
        min(int(limit), 500),
    )

    safe_offset = max(
        0,
        int(offset),
    )

    if (
        order_column
        and order_column in columns
    ):
        order_sql = f"`{order_column}` DESC"
    else:
        order_sql = "1 DESC"

    result = connection.execute(
        text(
            f"""
            SELECT *
            FROM `{table_name}`
            ORDER BY {order_sql}
            LIMIT :limit_value
            OFFSET :offset_value
            """
        ),
        {
            "limit_value": safe_limit,
            "offset_value": safe_offset,
        },
    )

    return [
        serialize_row(row)
        for row in result.fetchall()
    ]


def safe_count_from_table(
    connection: Any,
    table_name: str,
) -> int:
    try:
        return count_table(
            connection,
            table_name,
        )
    except Exception:
        logger.exception(
            "Failed counting table %s",
            table_name,
        )
        return 0


# ============================================================================
# SUMMARY
# ============================================================================

def get_summary() -> AdminSummary:
    with engine.connect() as connection:

        total_businesses = safe_count_from_table(
            connection,
            "businesses",
        )

        business_columns = get_table_columns(
            connection,
            "businesses",
        )

        if "status" in business_columns:
            active_businesses = count_table(
                connection,
                "businesses",
                """
                LOWER(
                    COALESCE(
                        CAST(status AS CHAR),
                        ''
                    )
                ) IN (
                    'active',
                    'enabled'
                )
                """,
            )
        else:
            active_businesses = total_businesses

        total_users = safe_count_from_table(
            connection,
            "users",
        )

        transaction_columns = get_table_columns(
            connection,
            "bank_transactions",
        )

        transaction_date_column = None

        for candidate in (
            "transaction_date",
            "date",
            "created_at",
        ):
            if candidate in transaction_columns:
                transaction_date_column = candidate
                break

        transactions_today = 0

        if transaction_date_column:
            transactions_today = count_table(
                connection,
                "bank_transactions",
                f"""
                DATE(`{transaction_date_column}`)
                = CURRENT_DATE
                """,
            )

        payment_columns = get_table_columns(
            connection,
            "payments",
        )

        payment_date_column = None

        for candidate in (
            "paid_at",
            "processed_at",
            "payment_date",
            "created_at",
        ):
            if candidate in payment_columns:
                payment_date_column = candidate
                break

        payments_today = 0

        if payment_date_column:
            payments_today = count_table(
                connection,
                "payments",
                f"""
                DATE(`{payment_date_column}`)
                = CURRENT_DATE
                """,
            )

        risk_columns = get_table_columns(
            connection,
            "risk_results",
        )

        high_risk = 0

        if "risk_level" in risk_columns:
            high_risk = count_table(
                connection,
                "risk_results",
                """
                UPPER(
                    COALESCE(
                        risk_level,
                        ''
                    )
                ) IN (
                    'HIGH',
                    'CRITICAL'
                )
                """,
            )

        ai_requests_today = 0

        for table_name in (
            "ai_requests",
            "ai_logs",
            "ai_insights",
        ):
            columns = get_table_columns(
                connection,
                table_name,
            )

            if "created_at" not in columns:
                continue

            ai_requests_today += count_table(
                connection,
                table_name,
                """
                DATE(created_at)
                = CURRENT_DATE
                """,
            )

        alert_columns = get_table_columns(
            connection,
            "alerts",
        )

        if "status" in alert_columns:
            system_alerts = count_table(
                connection,
                "alerts",
                """
                UPPER(
                    COALESCE(
                        status,
                        ''
                    )
                ) NOT IN (
                    'RESOLVED',
                    'CLOSED',
                    'DISMISSED'
                )
                """,
            )
        else:
            system_alerts = safe_count_from_table(
                connection,
                "alerts",
            )

    return AdminSummary(
        totalBusinesses=total_businesses,
        activeBusinesses=active_businesses,
        totalUsers=total_users,
        transactionsToday=transactions_today,
        paymentsToday=payments_today,
        highRiskTransactions=high_risk,
        aiRequestsToday=ai_requests_today,
        systemAlerts=system_alerts,
    )


# ============================================================================
# BUSINESS HELPERS
# ============================================================================

def _find_business_id(
    row: dict[str, Any],
) -> str:
    return clean_string(
        first_present(
            row,
            "id",
            "business_id",
            "businessId",
            "uuid",
            default="",
        )
    )


def _get_business_owner(
    connection: Any,
    business_id: str,
) -> dict[str, Any]:
    """
    Resolve business owner dynamically.

    Preferred relationship:

        businesses.owner_id -> users.id

    No owner is hardcoded here.
    """

    empty_result = {
        "owner": "—",
        "ownerId": None,
        "ownerEmail": None,
        "ownerRole": None,
    }

    if not business_id:
        return empty_result

    business_columns = get_table_columns(
        connection,
        "businesses",
    )

    user_columns = get_table_columns(
        connection,
        "users",
    )

    if (
        "owner_id" not in business_columns
        or "id" not in user_columns
    ):
        return empty_result

    try:
        result = connection.execute(
            text(
                """
                SELECT
                    b.owner_id AS owner_id,
                    u.name AS owner_name,
                    u.email AS owner_email,
                    u.role AS owner_role
                FROM businesses b
                LEFT JOIN users u
                    ON u.id = b.owner_id
                WHERE CAST(b.id AS CHAR) = :business_id
                LIMIT 1
                """
            ),
            {
                "business_id": business_id,
            },
        )

        row = result.fetchone()

        if row is None:
            return empty_result

        mapping = row._mapping

        owner_id = mapping.get("owner_id")

        owner_name = clean_string(
            mapping.get("owner_name"),
            "—",
        )

        owner_email = nullable_string(
            mapping.get("owner_email")
        )

        owner_role = nullable_string(
            mapping.get("owner_role")
        )

        if (
            owner_id is None
            and owner_name == "—"
            and owner_email is None
        ):
            return empty_result

        return {
            "owner": owner_name,
            "ownerId": (
                to_int(owner_id)
                if owner_id is not None
                else None
            ),
            "ownerEmail": owner_email,
            "ownerRole": owner_role,
        }

    except Exception:
        logger.exception(
            "Failed resolving business owner for business_id=%s",
            business_id,
        )
        return empty_result


def _business_user_count(
    connection: Any,
    business_id: str,
) -> int:
    columns = get_table_columns(
        connection,
        "users",
    )

    if "business_id" not in columns:
        return 0

    return count_table(
        connection,
        "users",
        """
        CAST(
            business_id AS CHAR
        ) = :business_id
        """,
        {
            "business_id": business_id,
        },
    )


def _business_transaction_count(
    connection: Any,
    business_id: str,
) -> int:
    columns = get_table_columns(
        connection,
        "bank_transactions",
    )

    if "business_id" not in columns:
        return 0

    return count_table(
        connection,
        "bank_transactions",
        """
        CAST(
            business_id AS CHAR
        ) = :business_id
        """,
        {
            "business_id": business_id,
        },
    )


def _business_outstanding(
    connection: Any,
    business_id: str,
) -> float:
    columns = get_table_columns(
        connection,
        "invoices",
    )

    if "business_id" not in columns:
        return 0.0

    if "outstanding_amount" in columns:
        expression = "outstanding_amount"

    elif "balance_due" in columns:
        expression = "balance_due"

    elif (
        "total_amount" in columns
        and "amount_paid" in columns
    ):
        expression = """
            GREATEST(
                COALESCE(total_amount, 0)
                -
                COALESCE(amount_paid, 0),
                0
            )
        """

    else:
        return 0.0

    result = connection.execute(
        text(
            f"""
            SELECT COALESCE(
                SUM({expression}),
                0
            )
            FROM invoices
            WHERE CAST(
                business_id AS CHAR
            ) = :business_id
            """
        ),
        {
            "business_id": business_id,
        },
    )

    return to_float(result.scalar())


def _business_banking_status(
    connection: Any,
    business_id: str,
) -> str:
    columns = get_table_columns(
        connection,
        "bank_accounts",
    )

    if "business_id" not in columns:
        return "Unavailable"

    count = count_table(
        connection,
        "bank_accounts",
        """
        CAST(
            business_id AS CHAR
        ) = :business_id
        """,
        {
            "business_id": business_id,
        },
    )

    return "Connected" if count > 0 else "Pending"


def _business_risk(
    connection: Any,
    business_id: str,
) -> str:
    risk_columns = get_table_columns(
        connection,
        "risk_results",
    )

    if "risk_level" not in risk_columns:
        return "LOW"

    payment_columns = get_table_columns(
        connection,
        "payments",
    )

    if (
        "payment_id" in risk_columns
        and "id" in payment_columns
        and "business_id" in payment_columns
    ):
        result = connection.execute(
            text(
                """
                SELECT rr.risk_level
                FROM risk_results rr
                INNER JOIN payments p
                    ON CAST(p.id AS CHAR)
                    =
                    CAST(rr.payment_id AS CHAR)
                WHERE CAST(
                    p.business_id AS CHAR
                ) = :business_id
                ORDER BY
                    CASE
                        WHEN UPPER(rr.risk_level) = 'CRITICAL'
                            THEN 4
                        WHEN UPPER(rr.risk_level) = 'HIGH'
                            THEN 3
                        WHEN UPPER(rr.risk_level) = 'MEDIUM'
                            THEN 2
                        WHEN UPPER(rr.risk_level) = 'LOW'
                            THEN 1
                        ELSE 0
                    END DESC,
                    rr.created_at DESC
                LIMIT 1
                """
            ),
            {
                "business_id": business_id,
            },
        )

        value = result.scalar()

        return (
            clean_string(value).upper()
            or "LOW"
        )

    if "business_id" in risk_columns:
        result = connection.execute(
            text(
                """
                SELECT risk_level
                FROM risk_results
                WHERE CAST(
                    business_id AS CHAR
                ) = :business_id
                ORDER BY
                    CASE
                        WHEN UPPER(risk_level) = 'CRITICAL'
                            THEN 4
                        WHEN UPPER(risk_level) = 'HIGH'
                            THEN 3
                        WHEN UPPER(risk_level) = 'MEDIUM'
                            THEN 2
                        WHEN UPPER(risk_level) = 'LOW'
                            THEN 1
                        ELSE 0
                    END DESC,
                    created_at DESC
                LIMIT 1
                """
            ),
            {
                "business_id": business_id,
            },
        )

        value = result.scalar()

        return (
            clean_string(value).upper()
            or "LOW"
        )

    return "LOW"


def _business_ai_available() -> bool:
    try:
        return bool(
            PAYMENT_DELAY_MODEL.exists()
            or CASH_FLOW_MODEL.exists()
            or _ollama_is_reachable()
        )
    except Exception:
        return False


# ============================================================================
# BUSINESSES
# ============================================================================

def get_businesses(
    limit: int = 500,
    offset: int = 0,
) -> tuple[
    list[BusinessAdminResponse],
    int,
]:
    with engine.connect() as connection:

        total = count_table(
            connection,
            "businesses",
        )

        business_columns = get_table_columns(
            connection,
            "businesses",
        )

        order_column = None

        for candidate in (
            "updated_at",
            "created_at",
        ):
            if candidate in business_columns:
                order_column = candidate
                break

        rows = fetch_table_rows(
            connection,
            "businesses",
            limit=limit,
            offset=offset,
            order_column=order_column,
        )

        businesses: list[
            BusinessAdminResponse
        ] = []

        ai_available = _business_ai_available()

        has_status_column = (
            "status" in business_columns
        )

        for row in rows:

            business_id = _find_business_id(row)

            name = clean_string(
                first_present(
                    row,
                    "display_name",
                    "business_name",
                    "company_name",
                    "name",
                    default=business_id or "Business",
                )
            )

            # ----------------------------------------------------------------
            # OWNER
            # ----------------------------------------------------------------

            owner_data = _get_business_owner(
                connection,
                business_id,
            )

            industry = clean_string(
                first_present(
                    row,
                    "industry",
                    "business_type",
                    "type",
                    "sector",
                    default="—",
                )
            )

            city = clean_string(
                first_present(
                    row,
                    "city",
                    default="",
                )
            )

            state = clean_string(
                first_present(
                    row,
                    "state",
                    default="",
                )
            )

            direct_location = first_present(
                row,
                "location",
                "address",
            )

            location = clean_string(
                direct_location,
                (
                    ", ".join(
                        value
                        for value in (
                            city,
                            state,
                        )
                        if value
                    )
                    or "—"
                ),
            )

            gstin = clean_string(
                first_present(
                    row,
                    "gstin",
                    "gst_number",
                    "gst_no",
                    "GSTIN",
                    default="—",
                )
            )

            # ----------------------------------------------------------------
            # STATUS
            # ----------------------------------------------------------------
            #
            # Current businesses table may not have a status column.
            # In that case an existing business is treated as ACTIVE.
            #

            if has_status_column:

                raw_status = clean_string(
                    first_present(
                        row,
                        "status",
                        default="ACTIVE",
                    )
                ).upper()

                if raw_status in {
                    "ACTIVE",
                    "ENABLED",
                }:
                    normalized_status = "ACTIVE"

                elif raw_status in {
                    "PENDING",
                    "ONBOARDING",
                }:
                    normalized_status = "PENDING"

                elif raw_status == "SUSPENDED":
                    normalized_status = "SUSPENDED"

                elif raw_status in {
                    "DISABLED",
                    "INACTIVE",
                }:
                    normalized_status = "INACTIVE"

                else:
                    normalized_status = "ACTIVE"

            else:
                normalized_status = "ACTIVE"

            last_active_value = first_present(
                row,
                "last_active",
                "last_activity",
                "updated_at",
                "created_at",
            )

            users_count = 0
            transaction_count = 0
            outstanding = 0.0
            banking = "Unavailable"
            risk = "LOW"

            if business_id:

                users_count = _business_user_count(
                    connection,
                    business_id,
                )

                transaction_count = (
                    _business_transaction_count(
                        connection,
                        business_id,
                    )
                )

                outstanding = _business_outstanding(
                    connection,
                    business_id,
                )

                banking = _business_banking_status(
                    connection,
                    business_id,
                )

                risk = _business_risk(
                    connection,
                    business_id,
                )

            response_data = {
                "id": business_id,

                "name": name,

                "owner": owner_data["owner"],

                "ownerId": owner_data["ownerId"],

                "ownerEmail": owner_data["ownerEmail"],

                "ownerRole": owner_data["ownerRole"],

                "industry": industry,

                "location": location,

                "city": city or None,

                "state": state or None,

                "users": users_count,

                "transactions": transaction_count,

                "outstanding": outstanding,

                "risk": risk,

                "banking": banking,

                "status": normalized_status,

                "lastActive": (
                    str(
                        serialize_value(
                            last_active_value
                        )
                    )
                    if last_active_value
                    else None
                ),

                "gstin": gstin,

                "ai": (
                    "Available"
                    if ai_available
                    else "Unavailable"
                ),

                "metadata": {
                    "source": "businesses",

                    "owner_mapping": (
                        "businesses.owner_id -> users.id"
                        if owner_data["ownerId"] is not None
                        else "not_configured"
                    ),

                    "status_mapping": (
                        "businesses.status"
                        if has_status_column
                        else "default_active"
                    ),
                },
            }

            businesses.append(
                BusinessAdminResponse(
                    **response_data
                )
            )

    return businesses, total


# ============================================================================
# BUSINESS MUTATION
# ============================================================================

def update_business_status(
    business_id: str,
    new_status: str,
) -> dict[str, Any]:

    normalized_id = clean_string(
        business_id
    )

    normalized_status = clean_string(
        new_status,
        "ACTIVE",
    ).upper()

    allowed_statuses = {
        "ACTIVE",
        "PENDING",
        "SUSPENDED",
        "INACTIVE",
    }

    if not normalized_id:
        raise ValueError(
            "Business ID is required."
        )

    if normalized_status not in allowed_statuses:
        raise ValueError(
            "Invalid business status."
        )

    with engine.begin() as connection:

        if not table_exists(
            connection,
            "businesses",
        ):
            raise ValueError(
                "Businesses table does not exist."
            )

        columns = get_table_columns(
            connection,
            "businesses",
        )

        if "status" not in columns:
            raise ValueError(
                "Businesses table does not contain status. "
                "Add a status column before using business status updates."
            )

        result = connection.execute(
            text(
                """
                SELECT *
                FROM businesses
                WHERE CAST(
                    id AS CHAR
                ) = :business_id
                LIMIT 1
                FOR UPDATE
                """
            ),
            {
                "business_id": normalized_id,
            },
        )

        existing = result.fetchone()

        if existing is None:
            raise ValueError(
                "Business not found."
            )

        update_sql = """
            UPDATE businesses
            SET status = :status
        """

        if "updated_at" in columns:
            update_sql += ", updated_at = NOW()"

        update_sql += """
            WHERE CAST(
                id AS CHAR
            ) = :business_id
        """

        connection.execute(
            text(update_sql),
            {
                "status": normalized_status,
                "business_id": normalized_id,
            },
        )

        updated = connection.execute(
            text(
                """
                SELECT *
                FROM businesses
                WHERE CAST(
                    id AS CHAR
                ) = :business_id
                LIMIT 1
                """
            ),
            {
                "business_id": normalized_id,
            },
        ).fetchone()

        if updated is None:
            raise ValueError(
                "Unable to reload updated business."
            )

        return serialize_row(updated)


# ============================================================================
# USERS
# ============================================================================

def get_users(
    limit: int = 500,
    offset: int = 0,
) -> tuple[
    list[AdminUserResponse],
    int,
]:
    with engine.connect() as connection:

        total = count_table(
            connection,
            "users",
        )

        user_columns = get_table_columns(
            connection,
            "users",
        )

        order_column = None

        for candidate in (
            "updated_at",
            "created_at",
        ):
            if candidate in user_columns:
                order_column = candidate
                break

        rows = fetch_table_rows(
            connection,
            "users",
            limit=limit,
            offset=offset,
            order_column=order_column,
        )

        users: list[
            AdminUserResponse
        ] = []

        for row in rows:

            user_id = to_int(
                first_present(
                    row,
                    "id",
                    default=0,
                )
            )

            if user_id <= 0:
                continue

            active = to_bool(
                first_present(
                    row,
                    "is_active",
                    "active",
                    default=True,
                ),
                default=True,
            )

            role = clean_string(
                first_present(
                    row,
                    "role",
                    default="user",
                )
            )

            normalized_role = role.strip().lower()

            security = (
                "Administrator"
                if normalized_role
                in {
                    "admin",
                    "administrator",
                    "owner",
                    "super_admin",
                    "superadmin",
                    "platform_admin",
                    "platform-admin",
                }
                else "Standard"
            )

            last_login = first_present(
                row,
                "last_login",
                "last_login_at",
                "last_active",
            )

            business = clean_string(
                first_present(
                    row,
                    "business",
                    "business_name",
                    "company_name",
                    "display_name",
                    default="—",
                )
            )

            business_id = first_present(
                row,
                "business_id",
                "businessId",
            )

            created_at = first_present(
                row,
                "created_at",
            )

            updated_at = first_present(
                row,
                "updated_at",
            )

            metadata = {
                "source": "users",
            }

            users.append(
                AdminUserResponse(
                    id=user_id,

                    name=clean_string(
                        first_present(
                            row,
                            "name",
                            "full_name",
                            "username",
                            default="User",
                        )
                    ),

                    email=clean_string(
                        first_present(
                            row,
                            "email",
                            default="",
                        )
                    ),

                    role=role,

                    status=(
                        "Active"
                        if active
                        else "Inactive"
                    ),

                    security=security,

                    business=business,

                    businessId=business_id,

                    isActive=active,

                    lastLogin=(
                        str(
                            serialize_value(
                                last_login
                            )
                        )
                        if last_login
                        else None
                    ),

                    created_at=(
                        str(
                            serialize_value(
                                created_at
                            )
                        )
                        if created_at
                        else None
                    ),

                    updated_at=(
                        str(
                            serialize_value(
                                updated_at
                            )
                        )
                        if updated_at
                        else None
                    ),

                    metadata=metadata,
                )
            )

    return users, total


# ============================================================================
# USER MUTATION
# ============================================================================

def update_user_status(
    user_id: int,
    is_active: bool,
) -> dict[str, Any]:

    normalized_id = to_int(user_id)

    if normalized_id <= 0:
        raise ValueError(
            "Valid user ID is required."
        )

    with engine.begin() as connection:

        if not table_exists(
            connection,
            "users",
        ):
            raise ValueError(
                "Users table does not exist."
            )

        columns = get_table_columns(
            connection,
            "users",
        )

        if "is_active" not in columns:
            raise ValueError(
                "Users table does not contain is_active."
            )

        result = connection.execute(
            text(
                """
                SELECT id
                FROM users
                WHERE id = :user_id
                LIMIT 1
                FOR UPDATE
                """
            ),
            {
                "user_id": normalized_id,
            },
        )

        if result.fetchone() is None:
            raise ValueError(
                "User not found."
            )

        update_sql = """
            UPDATE users
            SET is_active = :is_active
        """

        if "updated_at" in columns:
            update_sql += ", updated_at = NOW()"

        update_sql += """
            WHERE id = :user_id
        """

        connection.execute(
            text(update_sql),
            {
                "is_active": bool(is_active),
                "user_id": normalized_id,
            },
        )

        updated = connection.execute(
            text(
                """
                SELECT *
                FROM users
                WHERE id = :user_id
                LIMIT 1
                """
            ),
            {
                "user_id": normalized_id,
            },
        ).fetchone()

        if updated is None:
            raise ValueError(
                "Unable to reload updated user."
            )

        return serialize_row(updated)


# ============================================================================
# PLATFORM HEALTH
# ============================================================================

def get_platform_health() -> PlatformHealthResponse:

    services: list[
        ServiceHealthResponse
    ] = []

    # ------------------------------------------------------------------------
    # MYSQL
    # ------------------------------------------------------------------------

    database_status = "Unavailable"
    database_latency = "—"

    try:
        started = time.perf_counter()

        with engine.connect() as connection:
            connection.execute(
                text("SELECT 1")
            )

        elapsed = (
            time.perf_counter() - started
        ) * 1000

        database_status = "Healthy"
        database_latency = f"{elapsed:.0f} ms"

    except Exception:
        logger.exception(
            "MySQL health check failed."
        )

    services.append(
        ServiceHealthResponse(
            name="MySQL",
            status=database_status,
            latency=database_latency,
            errorRate="—",
            checked=now_iso(),
        )
    )

    # ------------------------------------------------------------------------
    # FASTAPI
    # ------------------------------------------------------------------------

    services.append(
        ServiceHealthResponse(
            name="FastAPI",
            status="Healthy",
            latency="—",
            errorRate="—",
            checked=now_iso(),
        )
    )

    # ------------------------------------------------------------------------
    # BANKING
    # ------------------------------------------------------------------------

    banking_ready = False

    try:
        with engine.connect() as connection:
            banking_ready = (
                table_exists(
                    connection,
                    "bank_accounts",
                )
                and
                table_exists(
                    connection,
                    "bank_transactions",
                )
            )
    except Exception:
        banking_ready = False

    services.append(
        ServiceHealthResponse(
            name="Banking API",
            status=(
                "Healthy"
                if banking_ready
                else "Unavailable"
            ),
            latency="—",
            errorRate="—",
            checked=now_iso(),
        )
    )

    # ------------------------------------------------------------------------
    # PAYMENTS
    # ------------------------------------------------------------------------

    payments_ready = False

    try:
        with engine.connect() as connection:
            payments_ready = (
                table_exists(
                    connection,
                    "payments",
                )
                or
                table_exists(
                    connection,
                    "invoice_payments",
                )
            )
    except Exception:
        payments_ready = False

    services.append(
        ServiceHealthResponse(
            name="Payment API",
            status=(
                "Healthy"
                if payments_ready
                else "Unavailable"
            ),
            latency="—",
            errorRate="—",
            checked=now_iso(),
        )
    )

    # ------------------------------------------------------------------------
    # ML
    # ------------------------------------------------------------------------

    payment_ml_ready = PAYMENT_DELAY_MODEL.exists()
    cash_ml_ready = CASH_FLOW_MODEL.exists()

    if payment_ml_ready and cash_ml_ready:
        ml_status = "Healthy"

    elif payment_ml_ready or cash_ml_ready:
        ml_status = "Degraded"

    else:
        ml_status = "Unavailable"

    services.append(
        ServiceHealthResponse(
            name="ML Service",
            status=ml_status,
            latency="—",
            errorRate="—",
            checked=now_iso(),
        )
    )

    # ------------------------------------------------------------------------
    # OLLAMA
    # ------------------------------------------------------------------------

    ai_ready = _ollama_is_reachable()

    services.append(
        ServiceHealthResponse(
            name="AI / Ollama",
            status=(
                "Healthy"
                if ai_ready
                else "Unavailable"
            ),
            latency="—",
            errorRate="—",
            checked=now_iso(),
        )
    )

    # ------------------------------------------------------------------------
    # NOTIFICATIONS
    # ------------------------------------------------------------------------

    notification_ready = False

    try:
        with engine.connect() as connection:
            notification_ready = table_exists(
                connection,
                "notifications",
            )
    except Exception:
        notification_ready = False

    services.append(
        ServiceHealthResponse(
            name="Notification Service",
            status=(
                "Healthy"
                if notification_ready
                else "Unavailable"
            ),
            latency="—",
            errorRate="—",
            checked=now_iso(),
        )
    )

    overall = "Healthy"

    if any(
        service.status == "Unavailable"
        for service in services
    ):
        overall = "Degraded"

    return PlatformHealthResponse(
        status=overall,
        database=database_status,
        services=services,
        checked=now_iso(),
    )


# ============================================================================
# OLLAMA CONFIGURATION
# ============================================================================

def _get_ollama_base_url() -> str:
    return (
        os.getenv(
            "OLLAMA_BASE_URL",
            "http://127.0.0.1:11434",
        )
        .strip()
        .rstrip("/")
    )


def _get_ollama_api_key() -> str:
    return os.getenv(
        "OLLAMA_API_KEY",
        "",
    ).strip()


def _get_ollama_model() -> str:
    return (
        os.getenv(
            "OLLAMA_MODEL",
            os.getenv(
                "MODEL",
                "",
            ),
        )
        .strip()
    )


def _ollama_headers() -> dict[str, str]:

    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
    }

    api_key = _get_ollama_api_key()

    if api_key:
        headers["Authorization"] = (
            f"Bearer {api_key}"
        )

    return headers


# ============================================================================
# OLLAMA HEALTH
# ============================================================================

def _ollama_is_reachable() -> bool:

    base_url = _get_ollama_base_url()

    if not base_url:
        return False

    url = f"{base_url}/api/tags"

    try:
        request = UrlRequest(
            url,
            method="GET",
            headers=_ollama_headers(),
        )

        with urlopen(
            request,
            timeout=4,
        ) as response:

            return (
                200
                <= response.status
                < 300
            )

    except (
        OSError,
        URLError,
        TimeoutError,
        HTTPError,
    ):
        return False


# ============================================================================
# OLLAMA MODEL DISCOVERY
# ============================================================================

def _ollama_models() -> list[
    dict[str, Any]
]:

    base_url = _get_ollama_base_url()

    if not base_url:
        return []

    url = f"{base_url}/api/tags"

    try:
        request = UrlRequest(
            url,
            method="GET",
            headers=_ollama_headers(),
        )

        with urlopen(
            request,
            timeout=5,
        ) as response:

            raw = (
                response.read()
                .decode("utf-8")
            )

            payload = json.loads(raw)

            if not isinstance(
                payload,
                dict,
            ):
                return []

            models = payload.get(
                "models",
                [],
            )

            if isinstance(
                models,
                list,
            ):
                return models

    except (
        OSError,
        URLError,
        TimeoutError,
        HTTPError,
        json.JSONDecodeError,
    ):
        logger.warning(
            "Unable to discover Ollama models."
        )

    return []


# ============================================================================
# OLLAMA GENERATION
# ============================================================================

def generate_ollama_response(
    prompt: str,
    *,
    system_prompt: str | None = None,
    model: str | None = None,
    temperature: float = 0.2,
) -> dict[str, Any]:

    normalized_prompt = clean_string(prompt)

    if not normalized_prompt:
        raise ValueError(
            "AI prompt is required."
        )

    base_url = _get_ollama_base_url()

    selected_model = (
        clean_string(model)
        or _get_ollama_model()
    )

    if not selected_model:
        raise ValueError(
            "OLLAMA_MODEL is not configured."
        )

    if not base_url:
        raise ValueError(
            "OLLAMA_BASE_URL is not configured."
        )

    payload: dict[str, Any] = {
        "model": selected_model,
        "prompt": normalized_prompt,
        "stream": False,
        "options": {
            "temperature": float(
                temperature
            ),
        },
    }

    if system_prompt:
        payload["system"] = system_prompt

    request = UrlRequest(
        f"{base_url}/api/generate",
        data=json.dumps(
            payload
        ).encode("utf-8"),
        method="POST",
        headers=_ollama_headers(),
    )

    started = time.perf_counter()

    try:
        with urlopen(
            request,
            timeout=60,
        ) as response:

            raw_body = (
                response.read()
                .decode("utf-8")
            )

            result = json.loads(
                raw_body
            )

        elapsed_ms = (
            time.perf_counter()
            - started
        ) * 1000

        return {
            "status": "success",
            "model": selected_model,
            "response": clean_string(
                result.get(
                    "response",
                    "",
                )
            ),
            "done": bool(
                result.get(
                    "done",
                    True,
                )
            ),
            "latency_ms": round(
                elapsed_ms,
                2,
            ),
            "raw": result,
        }

    except HTTPError as exc:

        body = ""

        try:
            body = (
                exc.read()
                .decode("utf-8")
            )
        except Exception:
            body = ""

        logger.exception(
            "Ollama generation failed with HTTP %s.",
            exc.code,
        )

        raise RuntimeError(
            body
            or (
                f"Ollama request failed "
                f"({exc.code})."
            )
        ) from exc

    except (
        OSError,
        URLError,
        TimeoutError,
        json.JSONDecodeError,
    ) as exc:

        logger.exception(
            "Ollama generation request failed."
        )

        raise RuntimeError(
            "Unable to reach the configured Ollama service."
        ) from exc


# ============================================================================
# AI STATUS
# ============================================================================

def get_ai_status() -> AIStatusResponse:

    provider = (
        os.getenv(
            "OLLAMA_PROVIDER",
            "Ollama",
        )
        .strip()
        or "Ollama"
    )

    base_url = _get_ollama_base_url()
    model = _get_ollama_model()

    configured = bool(
        base_url
        and model
    )

    connected = (
        _ollama_is_reachable()
        if configured
        else False
    )

    if connected:
        status_value = "Healthy"

        message = (
            "Ollama AI service is connected and ready."
        )

    elif configured:
        status_value = "Degraded"

        message = (
            "Ollama is configured but not reachable."
        )

    else:
        status_value = "Unavailable"

        message = (
            "Configure OLLAMA_BASE_URL and "
            "OLLAMA_MODEL to enable GenAI."
        )

    discovered_models: list[str] = []

    if connected:
        for item in _ollama_models():

            if not isinstance(
                item,
                dict,
            ):
                continue

            model_name = clean_string(
                item.get("name")
            )

            if model_name:
                discovered_models.append(
                    model_name
                )

    return AIStatusResponse(
        status=status_value,
        provider=provider,
        baseUrl=base_url,
        connected=connected,
        checked=now_iso(),
        model=model,
        available=connected,
        configured=configured,
        message=message,
        details={
            "provider": provider,
            "model": (
                model
                or "Not configured"
            ),
            "base_url": base_url,
            "api_key_configured": bool(
                _get_ollama_api_key()
            ),
            "ai_routes": [
                "/ai/chat",
                "/ai/insight",
                "/ai/insight/customer",
                "/ai/insight/invoice",
                "/ai/insight/cash-flow",
            ],
            "discovered_models":
                discovered_models,
        },
    )


# ============================================================================
# AI MODEL GOVERNANCE
# ============================================================================

def get_ai_models() -> list[
    AIModelResponse
]:

    models: list[
        AIModelResponse
    ] = []

    payment_ready = (
        PAYMENT_DELAY_MODEL.exists()
    )

    cash_ready = (
        CASH_FLOW_MODEL.exists()
    )

    payment_metadata = safe_json_load(
        PAYMENT_DELAY_METADATA
    )

    cash_metadata = safe_json_load(
        CASH_FLOW_METADATA
    )

    payment_version = clean_string(
        first_present(
            payment_metadata,
            "model_version",
            "version",
            default="Existing trained model",
        )
    )

    cash_version = clean_string(
        first_present(
            cash_metadata,
            "model_version",
            "version",
            default="Existing trained model",
        )
    )

    models.append(
        AIModelResponse(
            name="Payment Delay Predictor",
            version=payment_version,
            status=(
                "Healthy"
                if payment_ready
                else "Unavailable"
            ),
            predictions=(
                "Live"
                if payment_ready
                else "Unavailable"
            ),
            confidence=(
                "Model output"
                if payment_ready
                else "—"
            ),
            trained=(
                PAYMENT_DELAY_MODEL.name
                if payment_ready
                else None
            ),
            source=(
                "ml/src/prediction/"
                "payment_delay_predictor.py"
            ),
            modelType="ML",
            task="Payment delay risk",
            enabled=payment_ready,
            metadata=payment_metadata,
        )
    )

    models.append(
        AIModelResponse(
            name="Cash Flow Forecast Model",
            version=cash_version,
            status=(
                "Healthy"
                if cash_ready
                else "Unavailable"
            ),
            predictions=(
                "Live"
                if cash_ready
                else "Unavailable"
            ),
            confidence=(
                "Model output"
                if cash_ready
                else "—"
            ),
            trained=(
                CASH_FLOW_MODEL.name
                if cash_ready
                else None
            ),
            source=(
                "ml/src/prediction/"
                "cash_flow_predictor.py"
            ),
            modelType="ML",
            task="Cash-flow forecasting",
            enabled=cash_ready,
            metadata=cash_metadata,
        )
    )

    ollama_model = _get_ollama_model()

    ollama_ready = _ollama_is_reachable()

    available_models: list[str] = []

    if ollama_ready:

        for item in _ollama_models():

            if not isinstance(
                item,
                dict,
            ):
                continue

            model_name = clean_string(
                item.get("name")
            )

            if model_name:
                available_models.append(
                    model_name
                )

    models.append(
        AIModelResponse(
            name="CashGuard GenAI",
            version=(
                ollama_model
                or "Ollama provider"
            ),
            status=(
                "Healthy"
                if ollama_ready
                else "Unavailable"
            ),
            predictions=(
                "On demand"
                if ollama_ready
                else "Unavailable"
            ),
            confidence=(
                "Provider dependent"
                if ollama_ready
                else "—"
            ),
            trained="Provider managed",
            source="AI / Ollama",
            provider="Ollama",
            modelType="GenAI",
            task="Business intelligence",
            enabled=ollama_ready,
            metadata={
                "base_url":
                    _get_ollama_base_url(),
                "configured_model":
                    ollama_model,
                "available_models":
                    available_models,
            },
        )
    )

    return models


# ============================================================================
# ML STATUS
# ============================================================================

def get_ml_status() -> MLStatusResponse:

    payment_ready = (
        PAYMENT_DELAY_MODEL.exists()
    )

    cash_ready = (
        CASH_FLOW_MODEL.exists()
    )

    if payment_ready and cash_ready:
        overall = "Healthy"

    elif payment_ready or cash_ready:
        overall = "Degraded"

    else:
        overall = "Unavailable"

    return MLStatusResponse(
        status=overall,

        paymentDelayModel=(
            "Ready"
            if payment_ready
            else "Unavailable"
        ),

        cashFlowModel=(
            "Ready"
            if cash_ready
            else "Unavailable"
        ),

        modelsDirectory=str(
            ML_MODELS_DIR
        ),

        checked=now_iso(),

        available=(
            payment_ready
            or cash_ready
        ),

        payment_delay_model=(
            "Ready"
            if payment_ready
            else "Unavailable"
        ),

        cash_flow_model=(
            "Ready"
            if cash_ready
            else "Unavailable"
        ),

        models_endpoint=(
            "/api/admin/ai/models"
        ),

        loadedModels=(
            int(payment_ready)
            + int(cash_ready)
        ),

        metadata={
            "payment_delay_model_path":
                str(PAYMENT_DELAY_MODEL),

            "cash_flow_model_path":
                str(CASH_FLOW_MODEL),

            "payment_delay_metadata":
                str(PAYMENT_DELAY_METADATA),

            "cash_flow_metadata":
                str(CASH_FLOW_METADATA),
        },
    )


# ============================================================================
# AI INSIGHTS
# ============================================================================

def get_ai_insights(
    limit: int = 100,
) -> list[AIInsightResponse]:

    safe_limit = max(
        1,
        min(int(limit), 500),
    )

    with engine.connect() as connection:

        if not table_exists(
            connection,
            "ai_insights",
        ):
            return []

        columns = get_table_columns(
            connection,
            "ai_insights",
        )

        rows = fetch_table_rows(
            connection,
            "ai_insights",
            limit=safe_limit,
            offset=0,
            order_column=(
                "created_at"
                if "created_at" in columns
                else None
            ),
        )

    insights: list[
        AIInsightResponse
    ] = []

    for index, row in enumerate(rows):

        identifier = clean_string(
            first_present(
                row,
                "id",
                "insight_id",
                "uuid",
                default=f"AI-{index + 1}",
            )
        )

        confidence_value = first_present(
            row,
            "confidence",
            "confidence_score",
            "confidence_percent",
            default=None,
        )

        if confidence_value is None:
            confidence = None

        elif isinstance(
            confidence_value,
            (int, float, Decimal),
        ):
            confidence = float(
                confidence_value
            )

        else:
            confidence = clean_string(
                confidence_value
            )

        created_at_value = first_present(
            row,
            "created_at",
        )

        updated_at_value = first_present(
            row,
            "updated_at",
        )

        financial_impact = first_present(
            row,
            "financial_impact",
            "financialImpact",
        )

        metadata = {
            key: value
            for key, value in row.items()
            if key not in {
                "id",
                "insight_id",
                "uuid",
                "title",
                "headline",
                "name",
                "business_name",
                "business",
                "company_name",
                "severity",
                "priority",
                "level",
                "recommendation",
                "message",
                "description",
                "content",
                "confidence",
                "confidence_score",
                "confidence_percent",
                "model",
                "model_name",
                "model_version",
                "provider",
                "created_at",
                "updated_at",
            }
        }

        insights.append(
            AIInsightResponse(
                id=identifier,

                title=clean_string(
                    first_present(
                        row,
                        "title",
                        "headline",
                        "name",
                        default="AI insight",
                    )
                ),

                business=clean_string(
                    first_present(
                        row,
                        "business_name",
                        "business",
                        "company_name",
                        default="Platform",
                    )
                ),

                businessId=nullable_string(
                    first_present(
                        row,
                        "business_id",
                        "businessId",
                    )
                ),

                severity=clean_string(
                    first_present(
                        row,
                        "severity",
                        "priority",
                        "level",
                        default="Info",
                    )
                ),

                recommendation=clean_string(
                    first_present(
                        row,
                        "recommendation",
                        "message",
                        "description",
                        "content",
                        default="",
                    )
                ),

                confidence=confidence,

                model=clean_string(
                    first_present(
                        row,
                        "model",
                        "model_name",
                        "model_version",
                        "provider",
                        default="CashGuard-AI",
                    )
                ),

                created_at=(
                    str(
                        serialize_value(
                            created_at_value
                        )
                    )
                    if created_at_value
                    else None
                ),

                updated_at=(
                    str(
                        serialize_value(
                            updated_at_value
                        )
                    )
                    if updated_at_value
                    else None
                ),

                category=clean_string(
                    first_present(
                        row,
                        "category",
                        "type",
                        default="Cash Flow",
                    )
                ),

                source=clean_string(
                    first_present(
                        row,
                        "source",
                        default="AI",
                    )
                ),

                action=nullable_string(
                    first_present(
                        row,
                        "action",
                    )
                ),

                financialImpact=(
                    to_float(
                        financial_impact
                    )
                    if financial_impact is not None
                    else None
                ),

                horizon=nullable_string(
                    first_present(
                        row,
                        "horizon",
                        "time_horizon",
                    )
                ),

                metadata=metadata,
            )
        )

    return insights


# ============================================================================
# ANOMALIES
# ============================================================================

def get_anomalies(
    limit: int = 100,
) -> list[
    TransactionAnomalyResponse
]:

    safe_limit = max(
        1,
        min(int(limit), 500),
    )

    with engine.connect() as connection:

        if not table_exists(
            connection,
            "risk_results",
        ):
            return []

        risk_columns = get_table_columns(
            connection,
            "risk_results",
        )

        rows = fetch_table_rows(
            connection,
            "risk_results",
            limit=safe_limit,
            offset=0,
            order_column=(
                "created_at"
                if "created_at" in risk_columns
                else None
            ),
        )

        payment_lookup: dict[
            str,
            str,
        ] = {}

        payment_columns = get_table_columns(
            connection,
            "payments",
        )

        if (
            "id" in payment_columns
            and "business_id" in payment_columns
        ):
            payment_rows = connection.execute(
                text(
                    """
                    SELECT
                        id,
                        business_id
                    FROM payments
                    """
                )
            ).fetchall()

            for payment_row in payment_rows:

                mapping = (
                    payment_row._mapping
                )

                payment_id = mapping.get("id")
                business_id = mapping.get(
                    "business_id"
                )

                if payment_id is None:
                    continue

                payment_lookup[
                    str(payment_id)
                ] = clean_string(
                    business_id
                )

    anomalies: list[
        TransactionAnomalyResponse
    ] = []

    for row in rows:

        risk = clean_string(
            first_present(
                row,
                "risk_level",
                default="LOW",
            )
        ).upper()

        score = to_float(
            first_present(
                row,
                "risk_score",
                default=0,
            )
        )

        if (
            risk not in {
                "HIGH",
                "CRITICAL",
            }
            and score < 60
        ):
            continue

        payment_id = clean_string(
            first_present(
                row,
                "payment_id",
                "id",
                default="unknown",
            )
        )

        feature_value = first_present(
            row,
            "features",
        )

        if isinstance(
            feature_value,
            str,
        ):
            try:
                feature_value = json.loads(
                    feature_value
                )
            except json.JSONDecodeError:
                feature_value = {}

        amount_value = 0.0

        if isinstance(
            feature_value,
            dict,
        ):
            amount_value = to_float(
                first_present(
                    feature_value,
                    "payment_amount",
                    "amount",
                    "invoice_amount",
                    "transaction_amount",
                    default=0,
                )
            )

        signals_value = first_present(
            row,
            "signals",
            default=[],
        )

        if isinstance(
            signals_value,
            str,
        ):
            try:
                signals_value = json.loads(
                    signals_value
                )
            except json.JSONDecodeError:
                signals_value = []

        reason = ""

        if isinstance(
            signals_value,
            list,
        ):
            reason = ", ".join(
                str(item)
                for item
                in signals_value[:4]
                if str(item).strip()
            )

        if not reason:
            reason = (
                "Elevated payment risk "
                "detected by the risk engine."
            )

        business_id = payment_lookup.get(
            payment_id,
            "",
        )

        created_at = first_present(
            row,
            "created_at",
        )

        probability = first_present(
            row,
            "probability",
        )

        anomalies.append(
            TransactionAnomalyResponse(
                id=clean_string(
                    first_present(
                        row,
                        "id",
                        default=payment_id,
                    )
                ),

                business=(
                    business_id
                    or "Linked business"
                ),

                businessId=(
                    business_id
                    or None
                ),

                amount=amount_value,

                type=clean_string(
                    first_present(
                        row,
                        "type",
                        "risk_type",
                        default="Payment risk",
                    )
                ),

                risk=risk,

                score=score,

                reason=reason,

                status=clean_string(
                    first_present(
                        row,
                        "status",
                        default="New",
                    )
                ) or "New",

                created_at=(
                    str(
                        serialize_value(
                            created_at
                        )
                    )
                    if created_at
                    else None
                ),

                payment_id=payment_id,

                model=clean_string(
                    first_present(
                        row,
                        "model",
                        "model_version",
                        default="Risk Engine",
                    )
                ),

                confidence=(
                    to_float(probability)
                    if probability is not None
                    else None
                ),

                signals=(
                    signals_value
                    if isinstance(
                        signals_value,
                        list,
                    )
                    else []
                ),
            )
        )

    return anomalies


# ============================================================================
# ALERTS
# ============================================================================

def get_alerts(
    limit: int = 100,
    offset: int = 0,
) -> tuple[
    list[AdminAlertResponse],
    int,
]:

    with engine.connect() as connection:

        total = count_table(
            connection,
            "alerts",
        )

        columns = get_table_columns(
            connection,
            "alerts",
        )

        rows = fetch_table_rows(
            connection,
            "alerts",
            limit=limit,
            offset=offset,
            order_column=(
                "created_at"
                if "created_at" in columns
                else None
            ),
        )

    alerts: list[
        AdminAlertResponse
    ] = []

    for row in rows:

        metadata_value = first_present(
            row,
            "metadata",
            "alert_metadata",
        )

        if isinstance(
            metadata_value,
            str,
        ):
            try:
                metadata_value = json.loads(
                    metadata_value
                )
            except json.JSONDecodeError:
                metadata_value = None

        metadata = (
            metadata_value
            if isinstance(
                metadata_value,
                dict,
            )
            else None
        )

        user_value = first_present(
            row,
            "user_id",
        )

        user_id = None

        if user_value is not None:
            try:
                user_id = int(user_value)
            except (
                TypeError,
                ValueError,
            ):
                user_id = None

        created_at = first_present(
            row,
            "created_at",
        )

        read_at = first_present(
            row,
            "read_at",
        )

        resolved_at = first_present(
            row,
            "resolved_at",
        )

        alerts.append(
            AdminAlertResponse(
                id=clean_string(
                    first_present(
                        row,
                        "id",
                        default="",
                    )
                ),

                user_id=user_id,

                risk_result_id=nullable_string(
                    first_present(
                        row,
                        "risk_result_id",
                    )
                ),

                type=clean_string(
                    first_present(
                        row,
                        "type",
                        default="GENERAL",
                    )
                ),

                severity=clean_string(
                    first_present(
                        row,
                        "severity",
                        default="INFO",
                    )
                ),

                title=clean_string(
                    first_present(
                        row,
                        "title",
                        default="Alert",
                    )
                ),

                message=clean_string(
                    first_present(
                        row,
                        "message",
                        "description",
                        default="",
                    )
                ),

                entity_type=nullable_string(
                    first_present(
                        row,
                        "entity_type",
                    )
                ),

                entity_id=nullable_string(
                    first_present(
                        row,
                        "entity_id",
                    )
                ),

                status=clean_string(
                    first_present(
                        row,
                        "status",
                        default="UNREAD",
                    )
                ),

                metadata=metadata,

                created_at=(
                    str(
                        serialize_value(
                            created_at
                        )
                    )
                    if created_at
                    else None
                ),

                read_at=(
                    str(
                        serialize_value(
                            read_at
                        )
                    )
                    if read_at
                    else None
                ),

                resolved_at=(
                    str(
                        serialize_value(
                            resolved_at
                        )
                    )
                    if resolved_at
                    else None
                ),

                category=clean_string(
                    first_present(
                        row,
                        "category",
                        default=first_present(
                            row,
                            "type",
                            default="General",
                        ),
                    )
                ),

                source=clean_string(
                    first_present(
                        row,
                        "source",
                        default="CashGuard-AI",
                    )
                ),

                action_url=nullable_string(
                    first_present(
                        row,
                        "action_url",
                    )
                ),
            )
        )

    return alerts, total


# ============================================================================
# ALERT MUTATION
# ============================================================================

def update_alert(
    alert_id: str,
    *,
    status_value: str | None = None,
    is_read: bool | None = None,
    is_resolved: bool | None = None,
) -> dict[str, Any]:

    normalized_id = clean_string(
        alert_id
    )

    if not normalized_id:
        raise ValueError(
            "Alert ID is required."
        )

    with engine.begin() as connection:

        if not table_exists(
            connection,
            "alerts",
        ):
            raise ValueError(
                "Alerts table does not exist."
            )

        columns = get_table_columns(
            connection,
            "alerts",
        )

        result = connection.execute(
            text(
                """
                SELECT *
                FROM alerts
                WHERE CAST(
                    id AS CHAR
                ) = :alert_id
                LIMIT 1
                FOR UPDATE
                """
            ),
            {
                "alert_id": normalized_id,
            },
        )

        row = result.fetchone()

        if row is None:
            raise ValueError(
                "Alert not found."
            )

        updates: list[str] = []

        params: dict[
            str,
            Any,
        ] = {
            "alert_id": normalized_id
        }

        if (
            status_value is not None
            and "status" in columns
        ):
            updates.append(
                "status = :status"
            )

            params["status"] = clean_string(
                status_value
            ).upper()

        if (
            is_read is not None
            and "status" in columns
        ):
            if is_read:

                updates.append(
                    """
                    status = CASE
                        WHEN status = 'UNREAD'
                        THEN 'READ'
                        ELSE status
                    END
                    """
                )

                if "read_at" in columns:
                    updates.append(
                        """
                        read_at =
                        COALESCE(
                            read_at,
                            NOW()
                        )
                        """
                    )

            else:

                updates.append(
                    "status = 'UNREAD'"
                )

                if "read_at" in columns:
                    updates.append(
                        "read_at = NULL"
                    )

        if is_resolved is not None:

            if (
                is_resolved
                and "status" in columns
            ):
                updates.append(
                    "status = 'RESOLVED'"
                )

                if "resolved_at" in columns:
                    updates.append(
                        """
                        resolved_at =
                        COALESCE(
                            resolved_at,
                            NOW()
                        )
                        """
                    )

            elif (
                not is_resolved
                and "status" in columns
            ):
                updates.append(
                    "status = 'UNREAD'"
                )

                if "resolved_at" in columns:
                    updates.append(
                        "resolved_at = NULL"
                    )

        if not updates:
            return serialize_row(row)

        update_query = (
            """
            UPDATE alerts
            SET
            """
            + ", ".join(updates)
            + """
            WHERE CAST(
                id AS CHAR
            ) = :alert_id
            """
        )

        connection.execute(
            text(update_query),
            params,
        )

        updated = connection.execute(
            text(
                """
                SELECT *
                FROM alerts
                WHERE CAST(
                    id AS CHAR
                ) = :alert_id
                LIMIT 1
                """
            ),
            {
                "alert_id": normalized_id,
            },
        ).fetchone()

        if updated is None:
            raise ValueError(
                "Unable to reload updated alert."
            )

        return serialize_row(updated)


# ============================================================================
# AUDIT LOGS
# ============================================================================

def get_audit_logs(
    limit: int = 100,
    offset: int = 0,
) -> tuple[
    list[AuditLogResponse],
    int,
]:

    with engine.connect() as connection:

        total = count_table(
            connection,
            "audit_logs",
        )

        columns = get_table_columns(
            connection,
            "audit_logs",
        )

        rows = fetch_table_rows(
            connection,
            "audit_logs",
            limit=limit,
            offset=offset,
            order_column=(
                "created_at"
                if "created_at" in columns
                else None
            ),
        )

    logs: list[
        AuditLogResponse
    ] = []

    for row in rows:

        metadata_value = first_present(
            row,
            "metadata",
            "event_metadata",
        )

        if isinstance(
            metadata_value,
            str,
        ):
            try:
                metadata_value = json.loads(
                    metadata_value
                )
            except json.JSONDecodeError:
                metadata_value = None

        actor_value = first_present(
            row,
            "actor_user_id",
        )

        actor_id = None

        if actor_value is not None:
            try:
                actor_id = int(actor_value)
            except (
                TypeError,
                ValueError,
            ):
                actor_id = None

        event_type = clean_string(
            first_present(
                row,
                "event_type",
                "action",
                "event",
                default="UNKNOWN",
            )
        )

        entity_type = clean_string(
            first_present(
                row,
                "entity_type",
                "entity",
                "resource",
                default="UNKNOWN",
            )
        )

        actor_label = clean_string(
            first_present(
                row,
                "actor",
                "actor_email",
                "user_email",
                default=(
                    str(actor_id)
                    if actor_id is not None
                    else "Unknown"
                ),
            )
        )

        created_at = first_present(
            row,
            "created_at",
        )

        logs.append(
            AuditLogResponse(
                id=clean_string(
                    first_present(
                        row,
                        "id",
                        default="",
                    )
                ),

                actor_user_id=actor_id,

                event_type=event_type,

                entity_type=entity_type,

                entity_id=nullable_string(
                    first_present(
                        row,
                        "entity_id",
                        "resource_id",
                    )
                ),

                ip_address=nullable_string(
                    first_present(
                        row,
                        "ip_address",
                        "ip",
                    )
                ),

                request_id=nullable_string(
                    first_present(
                        row,
                        "request_id",
                    )
                ),

                metadata=(
                    metadata_value
                    if isinstance(
                        metadata_value,
                        dict,
                    )
                    else None
                ),

                created_at=(
                    str(
                        serialize_value(
                            created_at
                        )
                    )
                    if created_at
                    else None
                ),

                action=event_type,

                actor=actor_label,

                entity=entity_type,
            )
        )

    return logs, total


# ============================================================================
# DATA QUALITY
# ============================================================================

def get_data_quality() -> DataQualityResponse:

    table_names = [
        "businesses",
        "users",
        "invoices",
        "invoice_payments",
        "bank_accounts",
        "bank_transactions",
        "payments",
        "risk_results",
        "alerts",
        "notifications",
        "audit_logs",
        "ai_insights",
    ]

    results: list[
        dict[str, Any]
    ] = []

    with engine.connect() as connection:

        for table_name in table_names:

            exists = table_exists(
                connection,
                table_name,
            )

            if not exists:

                results.append(
                    {
                        "table": table_name,
                        "exists": False,
                        "rows": 0,
                        "status": "Missing",
                        "total_rows": 0,
                        "null_rows": 0,
                        "duplicate_rows": 0,
                        "invalid_rows": 0,
                        "score": 0,
                    }
                )

                continue

            try:

                total_rows = count_table(
                    connection,
                    table_name,
                )

                results.append(
                    {
                        "table": table_name,
                        "exists": True,
                        "rows": total_rows,
                        "status": "Healthy",
                        "total_rows": total_rows,
                        "null_rows": 0,
                        "duplicate_rows": 0,
                        "invalid_rows": 0,
                        "score": 100,
                    }
                )

            except Exception:

                logger.exception(
                    "Data-quality check failed for %s",
                    table_name,
                )

                results.append(
                    {
                        "table": table_name,
                        "exists": True,
                        "rows": 0,
                        "status": "Error",
                        "total_rows": 0,
                        "null_rows": 0,
                        "duplicate_rows": 0,
                        "invalid_rows": 0,
                        "score": 0,
                    }
                )

    healthy_tables = sum(
        1
        for item in results
        if item["exists"]
        and item["status"] == "Healthy"
    )

    degraded_tables = (
        len(results) - healthy_tables
    )

    overall_status = (
        "Healthy"
        if degraded_tables == 0
        else "Degraded"
    )

    return DataQualityResponse(
        status=overall_status,
        tablesChecked=len(results),
        tableResults=results,
        tables=results,
        healthyTables=healthy_tables,
        degradedTables=degraded_tables,
        generatedAt=now_iso(),
    )


# ============================================================================
# ADMIN DASHBOARD SNAPSHOT
# ============================================================================

def get_dashboard_snapshot() -> dict[
    str,
    Any,
]:

    summary = get_summary()

    return {
        "status": "success",

        "summary": model_to_dict(
            summary
        ),

        "generated_at": now_iso(),
    }


# ============================================================================
# EXPORTS
# ============================================================================

__all__ = [
    "get_summary",
    "get_businesses",
    "get_users",
    "get_platform_health",
    "get_ai_status",
    "get_ai_models",
    "get_ml_status",
    "get_ai_insights",
    "get_anomalies",
    "get_alerts",
    "get_audit_logs",
    "get_data_quality",
    "get_dashboard_snapshot",
    "generate_ollama_response",
    "update_business_status",
    "update_alert",
    "update_user_status",
]