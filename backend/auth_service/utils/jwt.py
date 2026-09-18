from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt
from dotenv import load_dotenv
from jwt.exceptions import (
    ExpiredSignatureError,
    InvalidTokenError,
)


# ============================================================
# LOAD ENVIRONMENT
# ============================================================

load_dotenv()


# ============================================================
# ENVIRONMENT HELPERS
# ============================================================

def _read_env(
    key: str,
    default: str = "",
) -> str:
    """
    Read an environment variable safely.

    Handles accidental surrounding quotes such as:

        JWT_SECRET_KEY="my-secret"

    as well as normal:

        JWT_SECRET_KEY=my-secret
    """

    value = os.getenv(
        key,
        default,
    )

    if value is None:
        return ""

    value = str(value).strip()

    # Remove matching surrounding quotes.
    if len(value) >= 2:
        if (
            value[0] == '"'
            and value[-1] == '"'
        ):
            value = value[1:-1].strip()

        elif (
            value[0] == "'"
            and value[-1] == "'"
        ):
            value = value[1:-1].strip()

    return value


# ============================================================
# JWT CONFIGURATION
# ============================================================

JWT_SECRET_KEY = _read_env(
    "JWT_SECRET_KEY"
)

JWT_ALGORITHM = (
    _read_env(
        "JWT_ALGORITHM",
        "HS256",
    )
    or "HS256"
)

JWT_EXPIRE_RAW = _read_env(
    "JWT_EXPIRE_MINUTES",
    "60",
)


# ============================================================
# JWT EXPIRATION
# ============================================================

try:
    JWT_EXPIRE_MINUTES = int(
        JWT_EXPIRE_RAW
    )
except (
    TypeError,
    ValueError,
) as exc:
    raise RuntimeError(
        "JWT_EXPIRE_MINUTES must be a valid integer."
    ) from exc


# ============================================================
# CONFIG VALIDATION
# ============================================================

if not JWT_SECRET_KEY:
    raise RuntimeError(
        "JWT_SECRET_KEY is missing in .env"
    )


if not JWT_ALGORITHM:
    raise RuntimeError(
        "JWT_ALGORITHM is missing in .env"
    )


if JWT_EXPIRE_MINUTES <= 0:
    raise RuntimeError(
        "JWT_EXPIRE_MINUTES must be greater than zero."
    )


# ============================================================
# SUPPORTED ALGORITHMS
# ============================================================
#
# We intentionally allow only HMAC algorithms used by this
# project's JWT configuration.
#
# This prevents an accidental/unsafe algorithm configuration.
# ============================================================

SUPPORTED_ALGORITHMS = {
    "HS256",
    "HS384",
    "HS512",
}

if JWT_ALGORITHM not in SUPPORTED_ALGORITHMS:
    raise RuntimeError(
        "Unsupported JWT_ALGORITHM. "
        "Use HS256, HS384, or HS512."
    )


# ============================================================
# TOKEN CREATION
# ============================================================

def create_access_token(
    user_id: int,
    email: str,
    role: str,
) -> str:
    """
    Create a signed JWT access token.

    Payload:

        sub   -> numeric user ID stored as string
        email -> normalized user email
        role  -> normalized user role
        iat   -> issued-at timestamp
        exp   -> expiration timestamp
        type  -> access
    """

    # --------------------------------------------------------
    # Validate user ID
    # --------------------------------------------------------

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

    # --------------------------------------------------------
    # Normalize identity fields
    # --------------------------------------------------------

    normalized_email = (
        str(email or "")
        .strip()
        .lower()
    )

    normalized_role = (
        str(role or "")
        .strip()
        .lower()
    )

    # --------------------------------------------------------
    # Time
    # --------------------------------------------------------

    now = datetime.now(
        timezone.utc
    )

    expires_at = (
        now
        + timedelta(
            minutes=JWT_EXPIRE_MINUTES
        )
    )

    # --------------------------------------------------------
    # Payload
    # --------------------------------------------------------

    payload: dict[str, Any] = {
        "sub": str(
            normalized_user_id
        ),
        "email": normalized_email,
        "role": normalized_role,
        "iat": now,
        "exp": expires_at,
        "type": "access",
    }

    # --------------------------------------------------------
    # Encode
    # --------------------------------------------------------

    try:
        token = jwt.encode(
            payload,
            JWT_SECRET_KEY,
            algorithm=JWT_ALGORITHM,
        )
    except Exception as exc:
        raise RuntimeError(
            "Failed to sign JWT access token."
        ) from exc

    return token


# ============================================================
# TOKEN DECODING
# ============================================================

def decode_access_token(
    token: str,
) -> dict[str, Any]:
    """
    Decode and validate a JWT access token.

    Validation includes:

        - token must be a string
        - Bearer prefix is accepted
        - signature
        - algorithm
        - exp
        - iat
        - sub
        - numeric user ID
        - access token type

    Raises:

        ExpiredSignatureError
        InvalidTokenError
    """

    # --------------------------------------------------------
    # Input validation
    # --------------------------------------------------------

    if not isinstance(
        token,
        str,
    ):
        raise InvalidTokenError(
            "Authentication token must be a string."
        )

    clean_token = (
        token.strip()
    )

    # --------------------------------------------------------
    # Remove Bearer prefix safely
    # --------------------------------------------------------

    if clean_token.lower().startswith(
        "bearer "
    ):
        clean_token = (
            clean_token[7:]
            .strip()
        )

    if not clean_token:
        raise InvalidTokenError(
            "Authentication token is empty."
        )

    # --------------------------------------------------------
    # Decode JWT
    # --------------------------------------------------------

    try:
        payload = jwt.decode(
            clean_token,
            JWT_SECRET_KEY,
            algorithms=[
                JWT_ALGORITHM
            ],
            options={
                "require": [
                    "sub",
                    "iat",
                    "exp",
                ],
            },
        )

    except ExpiredSignatureError:
        raise

    except InvalidTokenError:
        raise

    except Exception as exc:
        raise InvalidTokenError(
            "Unable to decode authentication token."
        ) from exc

    # --------------------------------------------------------
    # Payload validation
    # --------------------------------------------------------

    if not isinstance(
        payload,
        dict,
    ):
        raise InvalidTokenError(
            "Invalid JWT payload."
        )

    # --------------------------------------------------------
    # Subject validation
    # --------------------------------------------------------

    subject = payload.get(
        "sub"
    )

    if subject is None:
        raise InvalidTokenError(
            "Token subject is missing."
        )

    subject_string = str(
        subject
    ).strip()

    if not subject_string:
        raise InvalidTokenError(
            "Token subject is empty."
        )

    # --------------------------------------------------------
    # User ID validation
    # --------------------------------------------------------

    try:
        user_id = int(
            subject_string
        )
    except (
        TypeError,
        ValueError,
    ) as exc:
        raise InvalidTokenError(
            "Token subject must contain a valid user ID."
        ) from exc

    if user_id <= 0:
        raise InvalidTokenError(
            "Token subject must contain a positive user ID."
        )

    # --------------------------------------------------------
    # Token type validation
    # --------------------------------------------------------

    token_type = payload.get(
        "type"
    )

    if token_type is not None:
        normalized_type = (
            str(
                token_type
            )
            .strip()
            .lower()
        )

        if normalized_type != "access":
            raise InvalidTokenError(
                "Invalid token type."
            )

    # --------------------------------------------------------
    # Normalize returned payload
    #
    # Keep sub compatible with the existing auth service,
    # which converts it to int before loading the user.
    # --------------------------------------------------------

    payload["sub"] = str(
        user_id
    )

    if "email" in payload:
        payload["email"] = (
            str(
                payload.get("email") or ""
            )
            .strip()
            .lower()
        )

    if "role" in payload:
        payload["role"] = (
            str(
                payload.get("role") or ""
            )
            .strip()
            .lower()
        )

    return payload


# ============================================================
# USER ID FROM TOKEN
# ============================================================

def get_user_id_from_token(
    token: str,
) -> int:
    """
    Decode an access token and return its user ID.
    """

    payload = decode_access_token(
        token
    )

    subject = payload.get(
        "sub"
    )

    if subject is None:
        raise InvalidTokenError(
            "Token subject is missing."
        )

    try:
        user_id = int(
            str(
                subject
            ).strip()
        )
    except (
        TypeError,
        ValueError,
    ) as exc:
        raise InvalidTokenError(
            "Invalid user ID in token."
        ) from exc

    if user_id <= 0:
        raise InvalidTokenError(
            "Invalid user ID in token."
        )

    return user_id


# ============================================================
# OPTIONAL TOKEN INFO HELPER
# ============================================================

def get_token_payload(
    token: str,
) -> dict[str, Any]:
    """
    Return the validated JWT payload.

    This is a convenience wrapper for services that need
    access to email, role, or other validated claims.
    """

    return decode_access_token(
        token
    )