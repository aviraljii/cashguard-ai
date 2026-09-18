from __future__ import annotations

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
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

from auth_service.schemas.auth import (
    MessageResponse,
    TokenResponse,
    UserLogin,
    UserRegister,
    UserResponse,
)

from auth_service.services.auth_service import (
    create_user,
    get_user_by_email,
    get_user_by_id,
)

from auth_service.utils.jwt import (
    JWT_EXPIRE_MINUTES,
    create_access_token,
    decode_access_token,
)

from auth_service.utils.password import (
    verify_password,
)

from database import get_db


# ------------------------------------------------------------------
# ROUTER
# ------------------------------------------------------------------

router = APIRouter(
    prefix="/auth",
    tags=["Authentication"],
)


# ------------------------------------------------------------------
# JWT SECURITY
# ------------------------------------------------------------------

security = HTTPBearer(
    auto_error=False
)


# ==================================================================
# AUTHENTICATION HELPER
# ==================================================================


def get_authenticated_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(
        security
    ),
    db: Session = Depends(get_db),
):
    """
    Resolve the currently authenticated user from the JWT
    Authorization header.

    Expected header:

        Authorization: Bearer <access_token>
    """

    # --------------------------------------------------------------
    # Missing Authorization header
    # --------------------------------------------------------------

    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials are required",
            headers={
                "WWW-Authenticate": "Bearer"
            },
        )

    token = credentials.credentials

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials are required",
            headers={
                "WWW-Authenticate": "Bearer"
            },
        )

    # --------------------------------------------------------------
    # Decode JWT
    # --------------------------------------------------------------

    try:
        payload = decode_access_token(
            token
        )

    except ExpiredSignatureError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={
                "WWW-Authenticate": "Bearer"
            },
        ) from exc

    except InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
            headers={
                "WWW-Authenticate": "Bearer"
            },
        ) from exc

    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
            headers={
                "WWW-Authenticate": "Bearer"
            },
        ) from exc

    # --------------------------------------------------------------
    # User ID
    # --------------------------------------------------------------

    user_id = payload.get(
        "sub"
    )

    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
            headers={
                "WWW-Authenticate": "Bearer"
            },
        )

    try:
        user_id = int(
            user_id
        )

    except (
        TypeError,
        ValueError,
    ) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user ID in token",
            headers={
                "WWW-Authenticate": "Bearer"
            },
        ) from exc

    # --------------------------------------------------------------
    # Find user
    # --------------------------------------------------------------

    user = get_user_by_id(
        db,
        user_id,
    )

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={
                "WWW-Authenticate": "Bearer"
            },
        )

    # --------------------------------------------------------------
    # Active user check
    # --------------------------------------------------------------

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive",
        )

    return user


# ==================================================================
# REGISTER
# ==================================================================


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
)
def register(
    user_data: UserRegister,
    db: Session = Depends(get_db),
):
    """
    Register a new user.
    """

    try:
        return create_user(
            db,
            user_data,
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc


# ==================================================================
# LOGIN
# ==================================================================


@router.post(
    "/login",
    response_model=TokenResponse,
)
def login(
    credentials: UserLogin,
    db: Session = Depends(get_db),
):
    """
    Authenticate user and return JWT access token.
    """

    email = credentials.email.strip().lower()

    user = get_user_by_email(
        db,
        email,
    )

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={
                "WWW-Authenticate": "Bearer"
            },
        )

    if not verify_password(
        credentials.password,
        user.password_hash,
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={
                "WWW-Authenticate": "Bearer"
            },
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive",
        )

    # --------------------------------------------------------------
    # Generate JWT
    # --------------------------------------------------------------

    access_token = create_access_token(
        user_id=user.id,
        email=user.email,
        role=user.role,
    )

    return TokenResponse(
        access_token=access_token,
        expires_in=JWT_EXPIRE_MINUTES * 60,
    )


# ==================================================================
# CURRENT USER
# ==================================================================


@router.get(
    "/me",
    response_model=UserResponse,
)
def get_current_user(
    current_user=Depends(
        get_authenticated_user
    ),
):
    """
    Return the currently authenticated user.
    """

    return current_user


# ==================================================================
# LOGOUT
# ==================================================================


@router.post(
    "/logout",
    response_model=MessageResponse,
)
def logout():
    """
    JWT logout is handled client-side by removing the token.
    """

    return MessageResponse(
        message=(
            "Logout successful. "
            "Remove the access token on the client."
        )
    )