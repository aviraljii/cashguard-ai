from __future__ import annotations

import base64
import json
import logging
import os
from typing import Any

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    Request,
    status,
)
from sqlalchemy import text

from auth_service.database import engine

from admin_service.schemas import (
    AdminSummary,
    AlertUpdateRequest,
    AIStatusResponse,
    BusinessStatusUpdateRequest,
    MLStatusResponse,
    UserStatusUpdateRequest,
)

from admin_service.service import (
    get_ai_insights,
    get_ai_models,
    get_ai_status,
    get_alerts,
    get_anomalies,
    get_audit_logs,
    get_businesses,
    get_data_quality,
    get_ml_status,
    get_platform_health,
    get_summary,
    get_users,
    update_alert,
    update_business_status,
    update_user_status,
)


# ============================================================================
# LOGGER
# ============================================================================

logger = logging.getLogger(
    "cashguard.admin.routes"
)


# ============================================================================
# ROUTER
# ============================================================================

router = APIRouter()


# ============================================================================
# AUTH CONFIGURATION
# ============================================================================

LOCAL_ADMIN_HOSTS = {
    "127.0.0.1",
    "localhost",
    "::1",
}

AUTH_COOKIE_NAMES = (
    "access_token",
    "access",
    "access_cookie",
    "auth_token",
    "cashguard_access_token",
    "cashguard_token",
)

ADMIN_ROLES = {
    "admin",
    "administrator",
    "owner",
    "super_admin",
    "superadmin",
    "platform_admin",
    "platform-admin",
}

TRUTHY_VALUES = {
    "true",
    "1",
    "yes",
    "active",
    "enabled",
    "on",
}

FALSY_VALUES = {
    "false",
    "0",
    "no",
    "inactive",
    "disabled",
    "off",
}


# ============================================================================
# AUTH HELPERS
# ============================================================================

def clean_token(
    value: str | None,
) -> str:
    """
    Normalize a token value.

    Supports:
        Authorization: Bearer <token>
        Cookie: <token>
    """

    if not value:
        return ""

    token = value.strip()

    if token.lower().startswith("bearer "):
        token = token[7:].strip()

    return token


def get_request_token(
    request: Request,
) -> str:
    """
    Resolve the authentication token from:

    1. Authorization header
    2. Supported authentication cookies
    """

    authorization = clean_token(
        request.headers.get("Authorization")
    )

    if authorization:
        return authorization

    for cookie_name in AUTH_COOKIE_NAMES:
        cookie_value = clean_token(
            request.cookies.get(cookie_name)
        )

        if cookie_value:
            return cookie_value

    return ""


def decode_jwt_payload(
    token: str,
) -> dict[str, Any]:
    """
    Decode a JWT payload for compatibility with the existing project.

    IMPORTANT:
    This function only decodes the payload.
    It does NOT verify the JWT signature.

    The final production authentication layer should use the project's
    verified JWT dependency from auth_service.
    """

    if not token:
        return {}

    parts = token.split(".")

    if len(parts) != 3:
        return {}

    try:
        payload = parts[1]

        padding = "=" * (
            (-len(payload)) % 4
        )

        decoded = base64.urlsafe_b64decode(
            (payload + padding).encode("utf-8")
        )

        parsed = json.loads(
            decoded.decode("utf-8")
        )

        if isinstance(parsed, dict):
            return parsed

    except (
        ValueError,
        TypeError,
        UnicodeDecodeError,
        json.JSONDecodeError,
        base64.binascii.Error,
    ):
        logger.warning(
            "[ADMIN AUTH] Unable to decode JWT payload."
        )

    return {}


def is_admin_role(
    role: Any,
) -> bool:
    normalized = str(
        role or ""
    ).strip().lower()

    return normalized in ADMIN_ROLES


def configured_admin_emails() -> set[str]:
    """
    Read comma-separated admin emails from:

        ADMIN_EMAILS=user1@example.com,user2@example.com
    """

    raw = os.getenv(
        "ADMIN_EMAILS",
        "",
    ).strip()

    if not raw:
        return set()

    return {
        value.strip().lower()
        for value in raw.split(",")
        if value.strip()
    }


def configured_admin_user_ids() -> set[str]:
    """
    Read comma-separated admin user IDs from:

        ADMIN_USER_IDS=1,2,3
    """

    raw = os.getenv(
        "ADMIN_USER_IDS",
        "",
    ).strip()

    if not raw:
        return set()

    return {
        value.strip()
        for value in raw.split(",")
        if value.strip()
    }


def development_admin_enabled() -> bool:
    """
    Development-only admin fallback.

    Enable with:

        CASHGUARD_DEV_ADMIN=true

    This should NOT be enabled in production.
    """

    value = os.getenv(
        "CASHGUARD_DEV_ADMIN",
        "",
    ).strip().lower()

    return value in TRUTHY_VALUES


def is_local_request(
    request: Request,
) -> bool:
    """
    Allow the development fallback only for local requests.
    """

    if request.client is None:
        return False

    return (
        request.client.host
        in LOCAL_ADMIN_HOSTS
    )


def bool_value(
    value: Any,
    default: bool = True,
) -> bool:
    if value is None:
        return default

    if isinstance(value, bool):
        return value

    if isinstance(value, (int, float)):
        return value != 0

    normalized = (
        str(value)
        .strip()
        .lower()
    )

    if normalized in TRUTHY_VALUES:
        return True

    if normalized in FALSY_VALUES:
        return False

    return default


def normalized_status_to_bool(
    value: str | None,
) -> bool | None:
    """
    Convert frontend status values into the users.is_active boolean.
    """

    if value is None:
        return None

    normalized = (
        value.strip().lower()
    )

    if normalized in TRUTHY_VALUES:
        return True

    if normalized in FALSY_VALUES:
        return False

    return None


# ============================================================================
# DATABASE USER LOOKUP
# ============================================================================

def find_database_user(
    token_user_id: Any,
    token_email: str,
) -> Any:
    """
    Resolve the authenticated user from the current database.

    Current CashGuard users table uses an integer primary key.
    """

    with engine.connect() as connection:

        user_row = None

        # --------------------------------------------------------------------
        # ID LOOKUP
        # --------------------------------------------------------------------

        if (
            token_user_id is not None
            and str(token_user_id).strip()
        ):
            try:

                numeric_user_id = int(
                    str(token_user_id).strip()
                )

                user_row = connection.execute(
                    text(
                        """
                        SELECT
                            id,
                            name,
                            email,
                            role,
                            is_active
                        FROM users
                        WHERE id = :user_id
                        LIMIT 1
                        """
                    ),
                    {
                        "user_id":
                            numeric_user_id,
                    },
                ).fetchone()

            except (
                TypeError,
                ValueError,
            ):
                user_row = None

        # --------------------------------------------------------------------
        # EMAIL LOOKUP
        # --------------------------------------------------------------------

        if (
            user_row is None
            and token_email
        ):

            user_row = connection.execute(
                text(
                    """
                    SELECT
                        id,
                        name,
                        email,
                        role,
                        is_active
                    FROM users
                    WHERE LOWER(email) = :email
                    LIMIT 1
                    """
                ),
                {
                    "email":
                        token_email,
                },
            ).fetchone()

        return user_row


# ============================================================================
# ADMIN AUTHORIZATION
# ============================================================================

def require_admin(
    request: Request,
) -> dict[str, Any]:
    """
    Central administrator authorization.

    Resolution order:

    1. Authentication token
    2. JWT payload
    3. Explicit ADMIN_EMAILS allowlist
    4. Explicit ADMIN_USER_IDS allowlist
    5. JWT administrator role
    6. Current database user lookup
    7. Database administrator role
    8. Local development fallback
    9. 403
    """

    # =========================================================================
    # 1. TOKEN
    # =========================================================================

    token = get_request_token(request)

    if not token:

        logger.warning(
            "[ADMIN AUTH] Missing authentication token "
            "method=%s path=%s",
            request.method,
            request.url.path,
        )

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
            headers={
                "WWW-Authenticate":
                    "Bearer",
            },
        )

    # =========================================================================
    # 2. JWT PAYLOAD
    # =========================================================================

    payload = decode_jwt_payload(
        token
    )

    token_email = str(
        payload.get(
            "email",
            payload.get(
                "username",
                payload.get(
                    "user_email",
                    payload.get(
                        "email_address",
                        "",
                    ),
                ),
            ),
        )
        or ""
    ).strip().lower()

    token_user_id = payload.get(
        "user_id",
        payload.get(
            "userId",
            payload.get(
                "id",
                payload.get(
                    "sub",
                    None,
                ),
            ),
        ),
    )

    token_role = str(
        payload.get(
            "role",
            payload.get(
                "user_role",
                payload.get(
                    "account_role",
                    "",
                ),
            ),
        )
        or ""
    ).strip().lower()

    # =========================================================================
    # 3. CONFIGURED ADMIN EMAIL
    # =========================================================================

    admin_emails = (
        configured_admin_emails()
    )

    if (
        token_email
        and token_email in admin_emails
    ):

        logger.info(
            "[ADMIN AUTH] Authorized through ADMIN_EMAILS "
            "email=%s path=%s",
            token_email,
            request.url.path,
        )

        return {
            "user_id":
                token_user_id,
            "email":
                token_email,
            "role":
                "administrator",
            "source":
                "admin_email",
        }

    # =========================================================================
    # 4. CONFIGURED ADMIN USER ID
    # =========================================================================

    admin_user_ids = (
        configured_admin_user_ids()
    )

    if (
        token_user_id is not None
        and str(
            token_user_id
        ).strip()
        in admin_user_ids
    ):

        logger.info(
            "[ADMIN AUTH] Authorized through ADMIN_USER_IDS "
            "user_id=%s path=%s",
            token_user_id,
            request.url.path,
        )

        return {
            "user_id":
                token_user_id,
            "email":
                token_email,
            "role":
                "administrator",
            "source":
                "admin_user_id",
        }

    # =========================================================================
    # 5. JWT ROLE
    # =========================================================================

    if is_admin_role(
        token_role
    ):

        logger.info(
            "[ADMIN AUTH] Authorized through JWT role "
            "user_id=%s email=%s role=%s path=%s",
            token_user_id,
            token_email,
            token_role,
            request.url.path,
        )

        return {
            "user_id":
                token_user_id,
            "email":
                token_email,
            "role":
                token_role,
            "source":
                "jwt_role",
        }

    # =========================================================================
    # 6. DATABASE LOOKUP
    # =========================================================================

    try:

        user_row = find_database_user(
            token_user_id=token_user_id,
            token_email=token_email,
        )

    except Exception as exc:

        logger.exception(
            "[ADMIN AUTH] Database lookup failed."
        )

        if (
            development_admin_enabled()
            and is_local_request(request)
        ):

            logger.warning(
                "[ADMIN AUTH] Local development fallback "
                "granted because DB verification failed."
            )

            return {
                "user_id":
                    token_user_id,
                "email":
                    token_email,
                "role":
                    "administrator",
                "source":
                    "local_development",
            }

        raise HTTPException(
            status_code=503,
            detail=(
                "Unable to verify administrator access."
            ),
        ) from exc

    # =========================================================================
    # 7. DATABASE USER NOT FOUND
    # =========================================================================

    if user_row is None:

        if (
            development_admin_enabled()
            and is_local_request(request)
        ):

            logger.warning(
                "[ADMIN AUTH] Local development fallback "
                "granted because authenticated user was "
                "not found in users table."
            )

            return {
                "user_id":
                    token_user_id,
                "email":
                    token_email,
                "role":
                    "administrator",
                "source":
                    "local_development",
            }

        raise HTTPException(
            status_code=401,
            detail=(
                "Authenticated user was not found."
            ),
            headers={
                "WWW-Authenticate":
                    "Bearer",
            },
        )

    # =========================================================================
    # 8. CURRENT DATABASE USER
    # =========================================================================

    user = user_row._mapping

    database_user_id = user.get(
        "id"
    )

    database_name = str(
        user.get(
            "name",
            "",
        )
        or ""
    ).strip()

    database_email = str(
        user.get(
            "email",
            "",
        )
        or ""
    ).strip().lower()

    database_role = str(
        user.get(
            "role",
            "",
        )
        or ""
    ).strip().lower()

    database_is_active = bool_value(
        user.get(
            "is_active",
            True,
        ),
        default=True,
    )

    # =========================================================================
    # 9. ACTIVE ACCOUNT CHECK
    # =========================================================================

    if not database_is_active:

        logger.warning(
            "[ADMIN AUTH] Inactive account denied "
            "user_id=%s email=%s path=%s",
            database_user_id,
            database_email,
            request.url.path,
        )

        raise HTTPException(
            status_code=403,
            detail="Your account is inactive.",
        )

    # =========================================================================
    # 10. DATABASE ADMIN ROLE
    # =========================================================================

    if is_admin_role(
        database_role
    ):

        logger.info(
            "[ADMIN AUTH] Authorized through database role "
            "user_id=%s name=%s email=%s role=%s path=%s",
            database_user_id,
            database_name,
            database_email,
            database_role,
            request.url.path,
        )

        return {
            "user_id":
                database_user_id,
            "name":
                database_name,
            "email":
                database_email,
            "role":
                database_role,
            "source":
                "database_role",
        }

    # =========================================================================
    # 11. LOCAL DEVELOPMENT FALLBACK
    # =========================================================================

    if (
        development_admin_enabled()
        and is_local_request(request)
    ):

        logger.warning(
            "[ADMIN AUTH] Local development admin mode "
            "granted user_id=%s name=%s email=%s "
            "original_role=%s path=%s",
            database_user_id,
            database_name,
            database_email,
            database_role,
            request.url.path,
        )

        return {
            "user_id":
                database_user_id,
            "name":
                database_name,
            "email":
                database_email,
            "role":
                "administrator",
            "source":
                "local_development",
            "original_role":
                database_role,
        }

    # =========================================================================
    # 12. DENY
    # =========================================================================

    logger.warning(
        "[ADMIN AUTH] ACCESS DENIED "
        "user_id=%s name=%s email=%s role=%s path=%s",
        database_user_id,
        database_name,
        database_email,
        database_role,
        request.url.path,
    )

    raise HTTPException(
        status_code=403,
        detail=(
            "Administrator access is required."
        ),
    )


# ============================================================================
# ADMIN ROOT
# ============================================================================

@router.get(
    "",
    tags=["Admin"],
)
def admin_root(
    admin: dict[str, Any] = Depends(
        require_admin
    ),
) -> dict[str, Any]:

    return {
        "status":
            "success",

        "service":
            "CashGuard-AI Admin Control Centre",

        "message":
            "Administrator API is available.",

        "authenticated_user":
            admin,

        "endpoints": {
            "summary":
                "/api/admin/summary",
            "businesses":
                "/api/admin/businesses",
            "users":
                "/api/admin/users",
            "health":
                "/api/admin/health",
            "services":
                "/api/admin/services",
            "ai_status":
                "/api/admin/ai/status",
            "ai_models":
                "/api/admin/ai/models",
            "ai_insights":
                "/api/admin/ai/insights",
            "ml_status":
                "/api/admin/ml/status",
            "anomalies":
                "/api/admin/anomalies",
            "alerts":
                "/api/admin/alerts",
            "audit_logs":
                "/api/admin/audit-logs",
            "data_quality":
                "/api/admin/data-quality",
        },
    }


# ============================================================================
# SUMMARY
# ============================================================================

@router.get(
    "/summary",
    response_model=AdminSummary,
    tags=["Admin"],
)
def admin_summary(
    _: dict[str, Any] = Depends(
        require_admin
    ),
) -> AdminSummary:

    try:

        return get_summary()

    except HTTPException:
        raise

    except Exception as exc:

        logger.exception(
            "Failed to load admin summary."
        )

        raise HTTPException(
            status_code=500,
            detail=(
                "Unable to load admin summary."
            ),
        ) from exc


# ============================================================================
# BUSINESSES
# ============================================================================

@router.get(
    "/businesses",
    tags=["Admin"],
)
def admin_businesses(
    limit: int = Query(
        default=500,
        ge=1,
        le=500,
    ),
    offset: int = Query(
        default=0,
        ge=0,
    ),
    _: dict[str, Any] = Depends(
        require_admin
    ),
) -> dict[str, Any]:

    try:

        items, total = get_businesses(
            limit=limit,
            offset=offset,
        )

        return {
            "status":
                "success",
            "items":
                items,
            "data":
                items,
            "businesses":
                items,
            "total":
                total,
            "limit":
                limit,
            "offset":
                offset,
        }

    except HTTPException:
        raise

    except Exception as exc:

        logger.exception(
            "Failed to load admin businesses."
        )

        raise HTTPException(
            status_code=500,
            detail=(
                "Unable to load businesses."
            ),
        ) from exc


# ============================================================================
# BUSINESS UPDATE
# ============================================================================

@router.patch(
    "/businesses/{business_id}",
    tags=["Admin"],
)
def admin_update_business(
    business_id: str,
    payload: BusinessStatusUpdateRequest,
    _: dict[str, Any] = Depends(
        require_admin
    ),
) -> dict[str, Any]:

    try:

        updated = update_business_status(
            business_id=business_id,
            new_status=payload.status,
        )

        return {
            "status":
                "success",
            "message":
                "Business status updated successfully.",
            "business":
                updated,
        }

    except HTTPException:
        raise

    except ValueError as exc:

        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc

    except Exception as exc:

        logger.exception(
            "Failed to update business %s.",
            business_id,
        )

        raise HTTPException(
            status_code=500,
            detail=(
                "Unable to update business."
            ),
        ) from exc


# ============================================================================
# USERS
# ============================================================================

@router.get(
    "/users",
    tags=["Admin"],
)
def admin_users(
    limit: int = Query(
        default=500,
        ge=1,
        le=500,
    ),
    offset: int = Query(
        default=0,
        ge=0,
    ),
    _: dict[str, Any] = Depends(
        require_admin
    ),
) -> dict[str, Any]:

    try:

        items, total = get_users(
            limit=limit,
            offset=offset,
        )

        return {
            "status":
                "success",
            "items":
                items,
            "data":
                items,
            "users":
                items,
            "total":
                total,
            "limit":
                limit,
            "offset":
                offset,
        }

    except HTTPException:
        raise

    except Exception as exc:

        logger.exception(
            "Failed to load admin users."
        )

        raise HTTPException(
            status_code=500,
            detail=(
                "Unable to load users."
            ),
        ) from exc


# ============================================================================
# USER UPDATE
# ============================================================================

@router.patch(
    "/users/{user_id}",
    tags=["Admin"],
)
def admin_update_user(
    user_id: int,
    payload: UserStatusUpdateRequest,
    admin: dict[str, Any] = Depends(
        require_admin
    ),
) -> dict[str, Any]:

    try:

        authenticated_admin_id = (
            admin.get("user_id")
        )

        requested_is_active = (
            payload.is_active
        )

        if requested_is_active is None:

            requested_is_active = (
                normalized_status_to_bool(
                    payload.status
                )
            )

        if requested_is_active is None:

            raise HTTPException(
                status_code=422,
                detail=(
                    "Provide either is_active "
                    "or a valid status value."
                ),
            )

        # --------------------------------------------------------------------
        # Prevent the current admin from deactivating themselves.
        # --------------------------------------------------------------------

        if (
            authenticated_admin_id is not None
            and str(
                authenticated_admin_id
            )
            == str(user_id)
            and requested_is_active is False
        ):

            raise HTTPException(
                status_code=400,
                detail=(
                    "You cannot deactivate "
                    "your own administrator account."
                ),
            )

        updated = update_user_status(
            user_id=user_id,
            is_active=requested_is_active,
        )

        return {
            "status":
                "success",
            "message":
                "User status updated successfully.",
            "user":
                updated,
        }

    except HTTPException:
        raise

    except ValueError as exc:

        raise HTTPException(
            status_code=404,
            detail=str(exc),
        ) from exc

    except Exception as exc:

        logger.exception(
            "Failed to update user %s.",
            user_id,
        )

        raise HTTPException(
            status_code=500,
            detail=(
                "Unable to update user."
            ),
        ) from exc


# ============================================================================
# PLATFORM HEALTH
# ============================================================================

@router.get(
    "/health",
    tags=["Admin"],
)
def admin_health(
    _: dict[str, Any] = Depends(
        require_admin
    ),
) -> dict[str, Any]:

    try:

        health = get_platform_health()

        if hasattr(
            health,
            "model_dump",
        ):
            return health.model_dump()

        return health.dict()

    except HTTPException:
        raise

    except Exception as exc:

        logger.exception(
            "Failed to load platform health."
        )

        raise HTTPException(
            status_code=503,
            detail=(
                "Unable to load platform health."
            ),
        ) from exc


# ============================================================================
# SERVICES
# ============================================================================

@router.get(
    "/services",
    tags=["Admin"],
)
def admin_services(
    _: dict[str, Any] = Depends(
        require_admin
    ),
) -> dict[str, Any]:

    try:

        health = get_platform_health()

        services = health.services

        return {
            "status":
                "success",
            "health":
                health.status,
            "services":
                services,
            "items":
                services,
            "data":
                services,
        }

    except HTTPException:
        raise

    except Exception as exc:

        logger.exception(
            "Failed to load service health."
        )

        raise HTTPException(
            status_code=503,
            detail=(
                "Unable to load service health."
            ),
        ) from exc


# ============================================================================
# AI STATUS
# ============================================================================

@router.get(
    "/ai/status",
    response_model=AIStatusResponse,
    tags=["Admin"],
)
def admin_ai_status(
    _: dict[str, Any] = Depends(
        require_admin
    ),
) -> AIStatusResponse:

    try:

        return get_ai_status()

    except HTTPException:
        raise

    except Exception as exc:

        logger.exception(
            "Failed to load AI status."
        )

        raise HTTPException(
            status_code=503,
            detail=(
                "Unable to load AI status."
            ),
        ) from exc


# ============================================================================
# AI MODELS
# ============================================================================

@router.get(
    "/ai/models",
    tags=["Admin"],
)
def admin_ai_models(
    _: dict[str, Any] = Depends(
        require_admin
    ),
) -> dict[str, Any]:

    try:

        models = get_ai_models()

        return {
            "status":
                "success",
            "items":
                models,
            "models":
                models,
            "data":
                models,
            "total":
                len(models),
        }

    except HTTPException:
        raise

    except Exception as exc:

        logger.exception(
            "Failed to load AI models."
        )

        raise HTTPException(
            status_code=503,
            detail=(
                "Unable to load AI models."
            ),
        ) from exc


# ============================================================================
# AI INSIGHTS
# ============================================================================

@router.get(
    "/ai/insights",
    tags=["Admin"],
)
def admin_ai_insights(
    limit: int = Query(
        default=100,
        ge=1,
        le=500,
    ),
    _: dict[str, Any] = Depends(
        require_admin
    ),
) -> dict[str, Any]:

    try:

        insights = get_ai_insights(
            limit=limit
        )

        return {
            "status":
                "success",
            "items":
                insights,
            "insights":
                insights,
            "data":
                insights,
            "total":
                len(insights),
        }

    except HTTPException:
        raise

    except Exception as exc:

        logger.exception(
            "Failed to load AI insights."
        )

        raise HTTPException(
            status_code=503,
            detail=(
                "Unable to load AI insights."
            ),
        ) from exc


# ============================================================================
# ML STATUS
# ============================================================================

@router.get(
    "/ml/status",
    response_model=MLStatusResponse,
    tags=["Admin"],
)
def admin_ml_status(
    _: dict[str, Any] = Depends(
        require_admin
    ),
) -> MLStatusResponse:

    try:

        return get_ml_status()

    except HTTPException:
        raise

    except Exception as exc:

        logger.exception(
            "Failed to load ML status."
        )

        raise HTTPException(
            status_code=503,
            detail=(
                "Unable to load ML status."
            ),
        ) from exc


# ============================================================================
# ANOMALIES
# ============================================================================

@router.get(
    "/anomalies",
    tags=["Admin"],
)
def admin_anomalies(
    limit: int = Query(
        default=100,
        ge=1,
        le=500,
    ),
    _: dict[str, Any] = Depends(
        require_admin
    ),
) -> dict[str, Any]:

    try:

        anomalies = get_anomalies(
            limit=limit
        )

        return {
            "status":
                "success",
            "items":
                anomalies,
            "anomalies":
                anomalies,
            "data":
                anomalies,
            "total":
                len(anomalies),
        }

    except HTTPException:
        raise

    except Exception as exc:

        logger.exception(
            "Failed to load anomalies."
        )

        raise HTTPException(
            status_code=503,
            detail=(
                "Unable to load anomalies."
            ),
        ) from exc


# ============================================================================
# ALERTS
# ============================================================================

@router.get(
    "/alerts",
    tags=["Admin"],
)
def admin_alerts(
    limit: int = Query(
        default=100,
        ge=1,
        le=500,
    ),
    offset: int = Query(
        default=0,
        ge=0,
    ),
    _: dict[str, Any] = Depends(
        require_admin
    ),
) -> dict[str, Any]:

    try:

        items, total = get_alerts(
            limit=limit,
            offset=offset,
        )

        return {
            "status":
                "success",
            "items":
                items,
            "alerts":
                items,
            "data":
                items,
            "total":
                total,
            "limit":
                limit,
            "offset":
                offset,
        }

    except HTTPException:
        raise

    except Exception as exc:

        logger.exception(
            "Failed to load admin alerts."
        )

        raise HTTPException(
            status_code=503,
            detail=(
                "Unable to load alerts."
            ),
        ) from exc


# ============================================================================
# ALERT UPDATE
# ============================================================================

@router.patch(
    "/alerts/{alert_id}",
    tags=["Admin"],
)
def admin_update_alert(
    alert_id: str,
    payload: AlertUpdateRequest,
    _: dict[str, Any] = Depends(
        require_admin
    ),
) -> dict[str, Any]:

    try:

        updated = update_alert(
            alert_id=alert_id,
            status_value=payload.status,
            is_read=payload.is_read,
            is_resolved=payload.is_resolved,
        )

        return {
            "status":
                "success",
            "message":
                "Alert updated successfully.",
            "alert":
                updated,
        }

    except HTTPException:
        raise

    except ValueError as exc:

        raise HTTPException(
            status_code=404,
            detail=str(exc),
        ) from exc

    except Exception as exc:

        logger.exception(
            "Failed to update alert %s.",
            alert_id,
        )

        raise HTTPException(
            status_code=500,
            detail=(
                "Unable to update alert."
            ),
        ) from exc


# ============================================================================
# AUDIT LOGS
# ============================================================================

@router.get(
    "/audit-logs",
    tags=["Admin"],
)
def admin_audit_logs(
    limit: int = Query(
        default=100,
        ge=1,
        le=500,
    ),
    offset: int = Query(
        default=0,
        ge=0,
    ),
    _: dict[str, Any] = Depends(
        require_admin
    ),
) -> dict[str, Any]:

    try:

        items, total = get_audit_logs(
            limit=limit,
            offset=offset,
        )

        return {
            "status":
                "success",
            "items":
                items,
            "audit_logs":
                items,
            "data":
                items,
            "total":
                total,
            "limit":
                limit,
            "offset":
                offset,
        }

    except HTTPException:
        raise

    except Exception as exc:

        logger.exception(
            "Failed to load audit logs."
        )

        raise HTTPException(
            status_code=503,
            detail=(
                "Unable to load audit logs."
            ),
        ) from exc


# ============================================================================
# DATA QUALITY
# ============================================================================

@router.get(
    "/data-quality",
    tags=["Admin"],
)
def admin_data_quality(
    _: dict[str, Any] = Depends(
        require_admin
    ),
) -> dict[str, Any]:

    try:

        result = get_data_quality()

        if hasattr(
            result,
            "model_dump",
        ):
            return result.model_dump()

        return result.dict()

    except HTTPException:
        raise

    except Exception as exc:

        logger.exception(
            "Failed to load data quality."
        )

        raise HTTPException(
            status_code=503,
            detail=(
                "Unable to load data quality."
            ),
        ) from exc


# ============================================================================
# EXPORT
# ============================================================================

__all__ = [
    "router",
    "require_admin",
]