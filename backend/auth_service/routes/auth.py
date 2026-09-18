from __future__ import annotations

import logging
from datetime import date, datetime

from fastapi import (
    APIRouter,
    Cookie,
    Depends,
    HTTPException,
    Response,
    status,
)
from fastapi.security import (
    HTTPAuthorizationCredentials,
    HTTPBearer,
)
from jwt.exceptions import (
    ExpiredSignatureError,
    InvalidTokenError,
)
from sqlalchemy.orm import Session
from starlette.requests import Request

from audit_service.service import log_audit_event
from auth_service.database import get_db

from auth_service.schemas.auth import (
    ChangePasswordRequest,
    MessageResponse,
    TokenResponse,
    UserLogin,
    UserRegister,
    UserResponse,
    UserStatusUpdate,
    UserUpdate,
)

from auth_service.services.auth_service import (
    change_password,
    create_user,
    get_user_by_email,
    get_user_by_id,
    list_users,
    update_user,
    update_user_status,
)

from auth_service.utils.jwt import (
    JWT_EXPIRE_MINUTES,
    create_access_token,
    decode_access_token,
)

from auth_service.utils.password import (
    verify_password,
)


# ============================================================================
# LOGGER
# ============================================================================

logger = logging.getLogger(
    "cashguard.auth.routes"
)


# ============================================================================
# ROUTER
# ============================================================================

router = APIRouter(
    prefix="/auth",
    tags=["Authentication"],
)


# ============================================================================
# SECURITY
# ============================================================================

security = HTTPBearer(
    auto_error=False,
)

ACCESS_COOKIE_NAME = "cashguard_access_token"
REFRESH_COOKIE_NAME = "cashguard_refresh_token"


# ============================================================================
# ROLE CONFIGURATION
# ============================================================================

ADMIN_ROLES = {
    "admin",
    "administrator",
    "owner",
    "super_admin",
    "superadmin",
    "platform_admin",
    "platform-admin",
}


def normalize_role(role: object) -> str:
    return str(
        role or ""
    ).strip().lower()


def is_admin_role(role: object) -> bool:
    return (
        normalize_role(role)
        in ADMIN_ROLES
    )


# ============================================================================
# USER SERIALIZATION
# ============================================================================

def _serialize_user(
    user: object,
) -> dict:
    """
    Convert SQLAlchemy User object to a response-safe dictionary.
    """

    if user is None:
        return {}

    try:
        raw_data = dict(
            getattr(
                user,
                "__dict__",
                {},
            )
        )
    except Exception:
        raw_data = {}

    raw_data.pop(
        "_sa_instance_state",
        None,
    )

    for key, value in list(
        raw_data.items()
    ):
        if isinstance(
            value,
            (
                datetime,
                date,
            ),
        ):
            raw_data[key] = value.isoformat()

    for field_name in (
        "created_at",
        "updated_at",
    ):
        value = getattr(
            user,
            field_name,
            None,
        )

        if isinstance(
            value,
            (
                datetime,
                date,
            ),
        ):
            raw_data[field_name] = (
                value.isoformat()
            )
        elif value is not None:
            raw_data[field_name] = str(
                value
            )

    return raw_data


def _serialize_users(
    users: list,
) -> list[dict]:
    return [
        _serialize_user(user)
        for user in (
            users or []
        )
        if user is not None
    ]


# ============================================================================
# TOKEN HELPERS
# ============================================================================

def _clean_bearer_token(
    token: str | None,
) -> str | None:
    """
    Normalize a token received from:

      - Authorization header
      - Cookie
      - Swagger/manual Bearer input
    """

    if not token:
        return None

    cleaned = str(
        token
    ).strip()

    if not cleaned:
        return None

    if cleaned.lower().startswith(
        "bearer "
    ):
        cleaned = cleaned[7:].strip()

    return cleaned or None


def _extract_authorization_tokens(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None,
    cashguard_access_token: str | None,
) -> tuple[str | None, str | None]:
    """
    Extract both authentication candidates.

    The previous implementation returned only one token. That caused
    a stale/expired Bearer token in localStorage to block a valid
    HttpOnly cookie session.

    This version preserves both candidates so the caller can try:

        1. Bearer token
        2. HttpOnly access cookie

    The actual JWT verification happens later.
    """

    bearer_token: str | None = None
    cookie_token: str | None = None

    # ------------------------------------------------------------------
    # 1. FASTAPI HTTP BEARER
    # ------------------------------------------------------------------

    if credentials is not None:
        scheme = str(
            credentials.scheme or ""
        ).strip().lower()

        if scheme == "bearer":
            bearer_token = (
                _clean_bearer_token(
                    credentials.credentials
                )
            )

    # ------------------------------------------------------------------
    # 2. RAW AUTHORIZATION HEADER
    # ------------------------------------------------------------------

    if not bearer_token:
        raw_authorization = (
            request.headers.get(
                "Authorization"
            )
            or ""
        ).strip()

        if raw_authorization:
            parts = raw_authorization.split(
                " ",
                1,
            )

            if (
                len(parts) == 2
                and parts[0]
                .strip()
                .lower()
                == "bearer"
            ):
                bearer_token = (
                    _clean_bearer_token(
                        parts[1]
                    )
                )

    # ------------------------------------------------------------------
    # 3. HTTPONLY COOKIE
    # ------------------------------------------------------------------

    cookie_token = (
        _clean_bearer_token(
            cashguard_access_token
        )
    )

    return (
        bearer_token,
        cookie_token,
    )


# ============================================================================
# AUTHENTICATED USER
# ============================================================================

def get_authenticated_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(
        security
    ),
    cashguard_access_token: str | None = Cookie(
        default=None,
        alias=ACCESS_COOKIE_NAME,
    ),
    db: Session = Depends(get_db),
):
    """
    Resolve authenticated user.

    Supported authentication methods:

        1. Authorization: Bearer <JWT>
        2. cashguard_access_token HttpOnly cookie

    Authentication resolution:

        - Valid Bearer token -> use Bearer
        - Invalid/expired Bearer -> try cookie
        - Valid cookie -> authenticate
        - Neither valid -> 401

    This prevents a stale frontend Bearer token from overriding
    an otherwise valid HttpOnly cookie session.
    """

    # ========================================================================
    # AUTHENTICATION CANDIDATES
    # ========================================================================

    (
        bearer_token,
        cookie_token,
    ) = _extract_authorization_tokens(
        request=request,
        credentials=credentials,
        cashguard_access_token=(
            cashguard_access_token
        ),
    )

    # ------------------------------------------------------------------------
    # NO TOKEN
    # ------------------------------------------------------------------------

    if (
        not bearer_token
        and not cookie_token
    ):
        logger.warning(
            "[AUTH] Missing authentication token "
            "method=%s path=%s origin=%s",
            request.method,
            request.url.path,
            request.headers.get(
                "origin"
            ),
        )

        raise HTTPException(
            status_code=(
                status.HTTP_401_UNAUTHORIZED
            ),
            detail=(
                "Authentication credentials "
                "are required."
            ),
            headers={
                "WWW-Authenticate": "Bearer",
            },
        )

    # ========================================================================
    # BUILD VERIFICATION CANDIDATES
    # ========================================================================

    candidates: list[
        tuple[str, str]
    ] = []

    if bearer_token:
        candidates.append(
            (
                "authorization",
                bearer_token,
            )
        )

    if (
        cookie_token
        and cookie_token != bearer_token
    ):
        candidates.append(
            (
                "cookie",
                cookie_token,
            )
        )

    # ========================================================================
    # VERIFY CANDIDATES
    # ========================================================================

    payload = None
    token: str | None = None
    token_source: str | None = None
    last_token_error: Exception | None = None

    for (
        candidate_source,
        candidate_token,
    ) in candidates:

        try:
            candidate_payload = (
                decode_access_token(
                    candidate_token
                )
            )

        except ExpiredSignatureError as exc:
            last_token_error = exc

            logger.warning(
                "[AUTH] JWT expired "
                "source=%s path=%s",
                candidate_source,
                request.url.path,
            )

            # Important:
            # Do NOT reject immediately.
            # Try the next candidate, normally the cookie.
            continue

        except InvalidTokenError as exc:
            last_token_error = exc

            logger.warning(
                "[AUTH] Invalid JWT "
                "source=%s path=%s error=%s",
                candidate_source,
                request.url.path,
                repr(exc),
            )

            # Important:
            # Do NOT reject immediately.
            # Try the next candidate.
            continue

        except Exception as exc:
            last_token_error = exc

            logger.exception(
                "[AUTH] JWT validation failed "
                "source=%s path=%s",
                candidate_source,
                request.url.path,
            )

            # Try the next candidate.
            continue

        # --------------------------------------------------------------------
        # VALID TOKEN FOUND
        # --------------------------------------------------------------------

        payload = candidate_payload
        token = candidate_token
        token_source = candidate_source

        break

    # ------------------------------------------------------------------------
    # ALL TOKENS FAILED
    # ------------------------------------------------------------------------

    if (
        payload is None
        or not token
    ):
        logger.warning(
            "[AUTH] All authentication candidates failed "
            "method=%s path=%s",
            request.method,
            request.url.path,
        )

        raise HTTPException(
            status_code=(
                status.HTTP_401_UNAUTHORIZED
            ),
            detail=(
                "Invalid or expired authentication token. "
                "Please login again."
            ),
            headers={
                "WWW-Authenticate": "Bearer",
            },
        ) from last_token_error

    # ------------------------------------------------------------------------
    # COOKIE FALLBACK CONFIRMED
    # ------------------------------------------------------------------------

    if (
        token_source == "cookie"
        and bearer_token
    ):
        logger.info(
            "[AUTH] Bearer token rejected; "
            "valid HttpOnly cookie session accepted "
            "method=%s path=%s",
            request.method,
            request.url.path,
        )

    logger.debug(
        "[AUTH] Authentication candidate accepted "
        "source=%s method=%s path=%s",
        token_source,
        request.method,
        request.url.path,
    )

    # =========================================================================
    # PAYLOAD VALIDATION
    # =========================================================================

    if not isinstance(
        payload,
        dict,
    ):
        raise HTTPException(
            status_code=(
                status.HTTP_401_UNAUTHORIZED
            ),
            detail=(
                "Invalid authentication payload."
            ),
            headers={
                "WWW-Authenticate": "Bearer",
            },
        )

    # =========================================================================
    # USER ID
    # =========================================================================

    user_id = payload.get(
        "sub"
    )

    if user_id is None:
        user_id = payload.get(
            "user_id"
        )

    if user_id is None:
        raise HTTPException(
            status_code=(
                status.HTTP_401_UNAUTHORIZED
            ),
            detail=(
                "Token subject is missing."
            ),
            headers={
                "WWW-Authenticate": "Bearer",
            },
        )

    # =========================================================================
    # USER ID MUST BE INTEGER
    # =========================================================================

    try:
        user_id_int = int(
            str(
                user_id
            ).strip()
        )

    except (
        TypeError,
        ValueError,
    ) as exc:

        raise HTTPException(
            status_code=(
                status.HTTP_401_UNAUTHORIZED
            ),
            detail=(
                "Token subject is invalid. "
                "Expected numeric user ID."
            ),
            headers={
                "WWW-Authenticate": "Bearer",
            },
        ) from exc

    if user_id_int <= 0:
        raise HTTPException(
            status_code=(
                status.HTTP_401_UNAUTHORIZED
            ),
            detail=(
                "Token subject is invalid."
            ),
            headers={
                "WWW-Authenticate": "Bearer",
            },
        )

    # =========================================================================
    # LOAD USER
    # =========================================================================

    try:
        user = get_user_by_id(
            db,
            user_id_int,
        )

    except Exception as exc:
        logger.exception(
            "[AUTH] User lookup failed "
            "user_id=%s",
            user_id_int,
        )

        raise HTTPException(
            status_code=(
                status.HTTP_500_INTERNAL_SERVER_ERROR
            ),
            detail=(
                "Failed to load authenticated user."
            ),
        ) from exc

    # =========================================================================
    # USER NOT FOUND
    # =========================================================================

    if user is None:
        raise HTTPException(
            status_code=(
                status.HTTP_401_UNAUTHORIZED
            ),
            detail=(
                "Authenticated user was not found."
            ),
            headers={
                "WWW-Authenticate": "Bearer",
            },
        )

    # =========================================================================
    # ACTIVE USER CHECK
    # =========================================================================

    if not bool(
        user.is_active
    ):
        logger.warning(
            "[AUTH] Inactive user "
            "user_id=%s email=%s",
            user.id,
            user.email,
        )

        raise HTTPException(
            status_code=(
                status.HTTP_403_FORBIDDEN
            ),
            detail=(
                "User account is inactive."
            ),
        )

    # =========================================================================
    # EMAIL CONSISTENCY
    # =========================================================================

    token_email = (
        payload.get("email")
        or payload.get("username")
    )

    if token_email:
        token_email_normalized = (
            str(
                token_email
            )
            .strip()
            .lower()
        )

        db_email_normalized = (
            str(
                getattr(
                    user,
                    "email",
                    "",
                )
                or ""
            )
            .strip()
            .lower()
        )

        if (
            db_email_normalized
            and token_email_normalized
            != db_email_normalized
        ):
            logger.warning(
                "[AUTH] JWT email mismatch "
                "user_id=%s",
                user.id,
            )

            raise HTTPException(
                status_code=(
                    status.HTTP_401_UNAUTHORIZED
                ),
                detail=(
                    "Authentication token "
                    "does not match the user."
                ),
                headers={
                    "WWW-Authenticate": "Bearer",
                },
            )

    # =========================================================================
    # SUCCESS
    # =========================================================================

    logger.info(
        "[AUTH] User authenticated "
        "user_id=%s email=%s role=%s source=%s",
        user.id,
        user.email,
        normalize_role(
            user.role
        ),
        token_source,
    )

    return user


# ============================================================================
# ADMIN AUTHORIZATION
# ============================================================================

def require_admin(
    current_user=Depends(
        get_authenticated_user
    ),
):
    role = normalize_role(
        getattr(
            current_user,
            "role",
            "",
        )
    )

    if not role:
        logger.warning(
            "[ADMIN AUTH] Missing role "
            "user_id=%s email=%s",
            getattr(
                current_user,
                "id",
                None,
            ),
            getattr(
                current_user,
                "email",
                None,
            ),
        )

        raise HTTPException(
            status_code=(
                status.HTTP_403_FORBIDDEN
            ),
            detail=(
                "User role is not configured."
            ),
        )

    if not is_admin_role(
        role
    ):
        logger.warning(
            "[ADMIN AUTH] ACCESS DENIED "
            "user_id=%s email=%s role=%s",
            getattr(
                current_user,
                "id",
                None,
            ),
            getattr(
                current_user,
                "email",
                None,
            ),
            role,
        )

        raise HTTPException(
            status_code=(
                status.HTTP_403_FORBIDDEN
            ),
            detail=(
                "Administrator access is required."
            ),
        )

    logger.info(
        "[ADMIN AUTH] ACCESS GRANTED "
        "user_id=%s email=%s role=%s",
        current_user.id,
        current_user.email,
        role,
    )

    return current_user


# ============================================================================
# REGISTER
# ============================================================================

@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
)
def register(
    request: Request,
    user_data: UserRegister,
    db: Session = Depends(get_db),
):
    try:
        user = create_user(
            db,
            user_data,
        )

        try:
            log_audit_event(
                db,
                event_type="user_registered",
                entity_type="user",
                actor_user_id=user.id,
                entity_id=user.id,
                ip_address=(
                    request.client.host
                    if request.client
                    else None
                ),
                request_id=getattr(
                    request.state,
                    "request_id",
                    None,
                ),
                metadata={
                    "role": normalize_role(
                        user.role
                    ),
                },
            )

        except Exception:
            logger.exception(
                "[AUTH] Registration audit failed."
            )

        return _serialize_user(
            user
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=(
                status.HTTP_409_CONFLICT
            ),
            detail=str(exc),
        ) from exc

    except Exception as exc:
        logger.exception(
            "[AUTH] Registration failed."
        )

        raise HTTPException(
            status_code=(
                status.HTTP_500_INTERNAL_SERVER_ERROR
            ),
            detail=(
                "Failed to register user."
            ),
        ) from exc


# ============================================================================
# LOGIN
# ============================================================================

@router.post(
    "/login",
    response_model=TokenResponse,
)
def login(
    request: Request,
    response: Response,
    credentials: UserLogin,
    db: Session = Depends(get_db),
):
    email = str(
        credentials.email or ""
    ).strip().lower()

    password = str(
        credentials.password or ""
    )

    if not email:
        raise HTTPException(
            status_code=422,
            detail="Email is required.",
        )

    if not password:
        raise HTTPException(
            status_code=422,
            detail="Password is required.",
        )

    # =========================================================================
    # FIND USER
    # =========================================================================

    user = get_user_by_email(
        db,
        email,
    )

    if user is None:
        logger.warning(
            "[AUTH] Login failed "
            "user_not_found email=%s",
            email,
        )

        try:
            log_audit_event(
                db,
                event_type="failed_login",
                entity_type="user",
                metadata={
                    "reason": (
                        "invalid_credentials"
                    ),
                    "email": email,
                },
            )
        except Exception:
            logger.exception(
                "[AUTH] Failed-login audit error."
            )

        raise HTTPException(
            status_code=(
                status.HTTP_401_UNAUTHORIZED
            ),
            detail=(
                "Invalid email or password."
            ),
            headers={
                "WWW-Authenticate": "Bearer",
            },
        )

    # =========================================================================
    # VERIFY PASSWORD
    # =========================================================================

    try:
        password_valid = verify_password(
            password,
            user.password_hash,
        )

    except Exception as exc:
        logger.exception(
            "[AUTH] Password verification failed."
        )

        raise HTTPException(
            status_code=(
                status.HTTP_500_INTERNAL_SERVER_ERROR
            ),
            detail=(
                "Unable to verify login credentials."
            ),
        ) from exc

    if not password_valid:
        try:
            log_audit_event(
                db,
                event_type="failed_login",
                entity_type="user",
                actor_user_id=user.id,
                entity_id=user.id,
                metadata={
                    "reason": (
                        "invalid_credentials"
                    ),
                },
            )

        except Exception:
            logger.exception(
                "[AUTH] Failed-login audit error."
            )

        raise HTTPException(
            status_code=(
                status.HTTP_401_UNAUTHORIZED
            ),
            detail=(
                "Invalid email or password."
            ),
            headers={
                "WWW-Authenticate": "Bearer",
            },
        )

    # =========================================================================
    # ACTIVE CHECK
    # =========================================================================

    if not bool(
        user.is_active
    ):
        raise HTTPException(
            status_code=(
                status.HTTP_403_FORBIDDEN
            ),
            detail=(
                "User account is inactive."
            ),
        )

    # =========================================================================
    # ROLE
    # =========================================================================

    database_role = normalize_role(
        user.role
    )

    if not database_role:
        database_role = "user"

    # =========================================================================
    # CREATE ACCESS TOKEN
    # =========================================================================

    try:
        access_token = create_access_token(
            user_id=user.id,
            email=user.email,
            role=database_role,
        )

    except Exception as exc:
        logger.exception(
            "[AUTH] JWT creation failed."
        )

        raise HTTPException(
            status_code=(
                status.HTTP_500_INTERNAL_SERVER_ERROR
            ),
            detail=(
                "Failed to create authentication token."
            ),
        ) from exc

    # =========================================================================
    # VALIDATE CREATED TOKEN
    # =========================================================================

    try:
        created_payload = (
            decode_access_token(
                access_token
            )
        )

        if not isinstance(
            created_payload,
            dict,
        ):
            raise ValueError(
                "Created JWT payload is invalid."
            )

        created_sub = (
            created_payload.get(
                "sub"
            )
        )

        if created_sub is None:
            raise ValueError(
                "Created JWT does not contain sub."
            )

        if (
            str(
                created_sub
            ).strip()
            != str(
                user.id
            ).strip()
        ):
            raise ValueError(
                "Created JWT subject does not match user."
            )

        created_email = (
            created_payload.get(
                "email"
            )
        )

        if created_email:
            if (
                str(
                    created_email
                )
                .strip()
                .lower()
                != str(
                    user.email
                )
                .strip()
                .lower()
            ):
                raise ValueError(
                    "Created JWT email does not match user."
                )

        created_role = normalize_role(
            created_payload.get(
                "role"
            )
        )

        if (
            created_role
            != database_role
        ):
            raise ValueError(
                "Created JWT role does not match database role."
            )

    except Exception as exc:
        logger.exception(
            "[AUTH] Created JWT validation failed."
        )

        raise HTTPException(
            status_code=(
                status.HTTP_500_INTERNAL_SERVER_ERROR
            ),
            detail=(
                "Authentication token validation failed."
            ),
        ) from exc

    # =========================================================================
    # LOGIN AUDIT
    # =========================================================================

    try:
        log_audit_event(
            db,
            event_type="user_login",
            entity_type="user",
            actor_user_id=user.id,
            entity_id=user.id,
            ip_address=(
                request.client.host
                if request.client
                else None
            ),
            request_id=getattr(
                request.state,
                "request_id",
                None,
            ),
            metadata={
                "role": database_role,
            },
        )

    except Exception:
        logger.exception(
            "[AUTH] Login audit failed."
        )

    # =========================================================================
    # ACCESS COOKIE
    # =========================================================================

    response.set_cookie(
        key=ACCESS_COOKIE_NAME,
        value=access_token,
        max_age=(
            JWT_EXPIRE_MINUTES * 60
        ),
        expires=(
            JWT_EXPIRE_MINUTES * 60
        ),
        httponly=True,
        secure=False,
        samesite="lax",
        path="/",
    )

    # =========================================================================
    # CLEAR OLD REFRESH COOKIE
    # =========================================================================

    response.delete_cookie(
        key=REFRESH_COOKIE_NAME,
        path="/",
    )

    logger.info(
        "[AUTH] Login successful "
        "user_id=%s email=%s role=%s "
        "access_cookie_set=%s",
        user.id,
        user.email,
        database_role,
        True,
    )

    return TokenResponse(
        access_token=access_token,
        expires_in=(
            JWT_EXPIRE_MINUTES * 60
        ),
    )


# ============================================================================
# CURRENT USER
# ============================================================================

@router.get(
    "/me",
    response_model=UserResponse,
)
def get_current_user(
    current_user=Depends(
        get_authenticated_user
    ),
):
    return _serialize_user(
        current_user
    )


# ============================================================================
# UPDATE CURRENT USER
# ============================================================================

@router.patch(
    "/me",
    response_model=UserResponse,
)
def update_current_user(
    request: Request,
    user_data: UserUpdate,
    current_user=Depends(
        get_authenticated_user
    ),
    db: Session = Depends(get_db),
):
    try:
        user = update_user(
            db,
            current_user,
            user_data,
        )

        try:
            log_audit_event(
                db,
                event_type="profile_updated",
                entity_type="user",
                actor_user_id=user.id,
                entity_id=user.id,
                ip_address=(
                    request.client.host
                    if request.client
                    else None
                ),
                request_id=getattr(
                    request.state,
                    "request_id",
                    None,
                ),
            )

        except Exception:
            logger.exception(
                "[AUTH] Profile audit failed."
            )

        return _serialize_user(
            user
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc

    except Exception as exc:
        logger.exception(
            "[AUTH] Profile update failed."
        )

        raise HTTPException(
            status_code=500,
            detail=(
                "Failed to update profile."
            ),
        ) from exc


# ============================================================================
# CHANGE PASSWORD
# ============================================================================

@router.post(
    "/change-password",
    response_model=MessageResponse,
)
def change_current_user_password(
    request: Request,
    password_data: ChangePasswordRequest,
    current_user=Depends(
        get_authenticated_user
    ),
    db: Session = Depends(get_db),
):
    try:
        change_password(
            db,
            current_user,
            password_data,
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc

    except Exception as exc:
        logger.exception(
            "[AUTH] Password change failed."
        )

        raise HTTPException(
            status_code=500,
            detail=(
                "Failed to change password."
            ),
        ) from exc

    try:
        log_audit_event(
            db,
            event_type="password_changed",
            entity_type="user",
            actor_user_id=(
                current_user.id
            ),
            entity_id=(
                current_user.id
            ),
            ip_address=(
                request.client.host
                if request.client
                else None
            ),
            request_id=getattr(
                request.state,
                "request_id",
                None,
            ),
        )

    except Exception:
        logger.exception(
            "[AUTH] Password-change audit failed."
        )

    return MessageResponse(
        message=(
            "Password changed successfully."
        )
    )


# ============================================================================
# LIST USERS
# ============================================================================

@router.get(
    "/users",
    response_model=list[UserResponse],
)
def get_users(
    _admin=Depends(
        require_admin
    ),
    db: Session = Depends(get_db),
):
    users = list_users(
        db
    )

    return _serialize_users(
        users
    )


# ============================================================================
# UPDATE USER STATUS
# ============================================================================

@router.patch(
    "/users/{user_id}/status",
    response_model=UserResponse,
)
def set_user_status(
    request: Request,
    user_id: int,
    status_data: UserStatusUpdate,
    _admin=Depends(
        require_admin
    ),
    db: Session = Depends(get_db),
):
    user = get_user_by_id(
        db,
        user_id,
    )

    if user is None:
        raise HTTPException(
            status_code=404,
            detail="User not found.",
        )

    # =========================================================================
    # PREVENT ADMIN SELF-DEACTIVATION
    # =========================================================================

    if (
        _admin.id == user.id
        and not status_data.is_active
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "You cannot deactivate "
                "your own administrator account."
            ),
        )

    # =========================================================================
    # UPDATE STATUS
    # =========================================================================

    try:
        user = update_user_status(
            db,
            user,
            status_data.is_active,
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc

    except Exception as exc:
        logger.exception(
            "[AUTH] User status update failed "
            "user_id=%s",
            user_id,
        )

        raise HTTPException(
            status_code=500,
            detail=(
                "Failed to update user status."
            ),
        ) from exc

    # =========================================================================
    # AUDIT
    # =========================================================================

    try:
        log_audit_event(
            db,
            event_type=(
                "user_activated"
                if user.is_active
                else "user_deactivated"
            ),
            entity_type="user",
            actor_user_id=_admin.id,
            entity_id=user.id,
            ip_address=(
                request.client.host
                if request.client
                else None
            ),
            request_id=getattr(
                request.state,
                "request_id",
                None,
            ),
        )

    except Exception:
        logger.exception(
            "[AUTH] User-status audit failed."
        )

    return _serialize_user(
        user
    )


# ============================================================================
# LOGOUT
# ============================================================================

@router.post(
    "/logout",
    response_model=MessageResponse,
)
def logout(
    response: Response,
):
    response.delete_cookie(
        key=ACCESS_COOKIE_NAME,
        path="/",
    )

    response.delete_cookie(
        key=REFRESH_COOKIE_NAME,
        path="/",
    )

    return MessageResponse(
        message="Logout successful."
    )