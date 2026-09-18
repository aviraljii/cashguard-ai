from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, load_only

from auth_service.models.user import User

from auth_service.schemas.auth import (
    ChangePasswordRequest,
    UserRegister,
    UserUpdate,
)

from auth_service.utils.password import (
    hash_password,
    verify_password,
)


# ============================================================================
# CONSTANTS
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

ALLOWED_USER_ROLES = {
    "user",
    "admin",
    "administrator",
    "owner",
    "super_admin",
    "superadmin",
    "platform_admin",
    "platform-admin",
}

MIN_PASSWORD_LENGTH = 8
MAX_PASSWORD_LENGTH = 255
MAX_NAME_LENGTH = 100
MAX_EMAIL_LENGTH = 255


# ============================================================================
# DATABASE COMPATIBILITY
# ============================================================================
#
# Current database schema supports the core User fields used by
# authentication and User Panel basics.
#
# The SQLAlchemy User model may contain additional mapped fields such as:
#
#   mobile
#   job_title
#   designation
#   city
#   state
#
# If those columns are not yet present in the actual MySQL `users` table,
# using select(User) without load_only() causes SQLAlchemy to generate a
# SELECT containing those missing columns.
#
# Therefore authentication queries intentionally load only the fields that
# are required by the current backend.
# ============================================================================

CORE_USER_ATTRIBUTE_NAMES = (
    "id",
    "name",
    "email",
    "password_hash",
    "role",
    "is_active",
    "created_at",
    "updated_at",
)

CORE_USER_COLUMNS = (
    User.id,
    User.name,
    User.email,
    User.password_hash,
    User.role,
    User.is_active,
    User.created_at,
    User.updated_at,
)


def _core_user_load_options():
    """
    Return SQLAlchemy loader options that prevent optional/missing
    User columns from being included in SELECT statements.
    """

    return [
        load_only(*CORE_USER_COLUMNS)
    ]


def _commit_without_full_user_expiration(
    db: Session,
    user: User,
) -> User:
    """
    Commit a User without causing SQLAlchemy to later re-load all
    mapped User columns, including optional columns that may not yet
    exist in the physical database.

    Only the supported core attributes are refreshed.
    """

    previous_expire_on_commit = db.expire_on_commit

    try:
        db.expire_on_commit = False
        db.commit()

        db.refresh(
            user,
            attribute_names=list(
                CORE_USER_ATTRIBUTE_NAMES
            ),
        )

    except Exception:
        db.rollback()
        raise

    finally:
        db.expire_on_commit = previous_expire_on_commit

    return user


# ============================================================================
# HELPERS
# ============================================================================

def normalize_email(
    email: object,
) -> str:
    """
    Normalize an email address consistently.
    """

    return (
        str(email or "")
        .strip()
        .lower()
    )


def normalize_name(
    name: object,
) -> str:
    """
    Normalize a user's display name.
    """

    return str(
        name or ""
    ).strip()


def normalize_role(
    role: object,
) -> str:
    """
    Normalize application role values.

    Public registration always uses 'user'.
    """

    normalized = (
        str(role or "")
        .strip()
        .lower()
    )

    return normalized or "user"


def is_privileged_role(
    role: object,
) -> bool:
    """
    Check whether the role has administrator privileges.
    """

    return (
        normalize_role(role)
        in ADMIN_ROLES
    )


def user_is_admin(
    user: User | None,
) -> bool:
    """
    Check whether a user currently has administrator privileges.
    """

    if user is None:
        return False

    return is_privileged_role(
        user.role
    )


def user_is_active(
    user: User | None,
) -> bool:
    """
    Check whether a user account is active.
    """

    if user is None:
        return False

    return bool(
        user.is_active
    )


def _validate_name(
    name: object,
) -> str:

    normalized_name = normalize_name(
        name
    )

    if not normalized_name:
        raise ValueError(
            "Name is required."
        )

    if len(normalized_name) > MAX_NAME_LENGTH:
        raise ValueError(
            f"Name must not exceed "
            f"{MAX_NAME_LENGTH} characters."
        )

    return normalized_name


def _validate_email(
    email: object,
) -> str:

    normalized_email = normalize_email(
        email
    )

    if not normalized_email:
        raise ValueError(
            "Email is required."
        )

    if len(normalized_email) > MAX_EMAIL_LENGTH:
        raise ValueError(
            f"Email must not exceed "
            f"{MAX_EMAIL_LENGTH} characters."
        )

    if (
        "@" not in normalized_email
        or "." not in normalized_email.rsplit(
            "@",
            1,
        )[-1]
    ):
        raise ValueError(
            "Enter a valid email address."
        )

    return normalized_email


def _validate_password(
    password: object,
    *,
    field_name: str,
) -> str:

    value = str(
        password or ""
    )

    if not value:
        raise ValueError(
            f"{field_name} is required."
        )

    if len(value) < MIN_PASSWORD_LENGTH:
        raise ValueError(
            f"{field_name} must contain at least "
            f"{MIN_PASSWORD_LENGTH} characters."
        )

    if len(value) > MAX_PASSWORD_LENGTH:
        raise ValueError(
            f"{field_name} must not exceed "
            f"{MAX_PASSWORD_LENGTH} characters."
        )

    return value


# ============================================================================
# FIND USER BY EMAIL
# ============================================================================

def get_user_by_email(
    db: Session,
    email: str,
) -> User | None:
    """
    Find a user using normalized email.

    IMPORTANT:
    Only core database-supported User columns are loaded.
    This prevents SQLAlchemy from selecting optional columns such as
    `mobile`, `job_title`, `city`, or `state` when those columns are not
    present in the current database schema.
    """

    normalized_email = normalize_email(
        email
    )

    if not normalized_email:
        return None

    statement = (
        select(User)
        .options(
            *_core_user_load_options()
        )
        .where(
            User.email == normalized_email
        )
        .limit(1)
    )

    return db.scalar(
        statement
    )


# ============================================================================
# FIND USER BY ID
# ============================================================================

def get_user_by_id(
    db: Session,
    user_id: int,
) -> User | None:
    """
    Find a user using the numeric primary key.

    Only supported core columns are loaded.
    """

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

    statement = (
        select(User)
        .options(
            *_core_user_load_options()
        )
        .where(
            User.id == normalized_user_id
        )
        .limit(1)
    )

    return db.scalar(
        statement
    )


# ============================================================================
# CREATE USER
# ============================================================================

def create_user(
    db: Session,
    user_data: UserRegister,
) -> User:
    """
    Create a normal CashGuard-AI user.

    Public registration is deliberately restricted to:

        role = user
        is_active = True

    The client cannot choose an administrator role.
    """

    normalized_name = _validate_name(
        getattr(
            user_data,
            "name",
            "",
        )
    )

    normalized_email = _validate_email(
        getattr(
            user_data,
            "email",
            "",
        )
    )

    password = _validate_password(
        getattr(
            user_data,
            "password",
            "",
        ),
        field_name="Password",
    )

    existing_user = get_user_by_email(
        db,
        normalized_email,
    )

    if existing_user is not None:
        raise ValueError(
            "Email is already registered."
        )

    user = User(
        name=normalized_name,
        email=normalized_email,
        password_hash=hash_password(
            password
        ),
        role="user",
        is_active=True,
    )

    try:
        db.add(user)
        db.flush()

        _commit_without_full_user_expiration(
            db,
            user,
        )

    except IntegrityError as exc:
        db.rollback()

        raise ValueError(
            "Email is already registered."
        ) from exc

    except Exception:
        db.rollback()
        raise

    return user


# ============================================================================
# UPDATE CURRENT USER
# ============================================================================

def update_user(
    db: Session,
    user: User,
    user_data: UserUpdate,
) -> User:
    """
    Update the authenticated user's core profile.

    Role and is_active are never modified here.

    Current database-safe profile fields:

        name
        email

    Optional profile fields such as mobile/job_title/city/state are
    intentionally not written here because they are not guaranteed to
    exist in the current database schema.
    """

    if user is None:
        raise ValueError(
            "User is required."
        )

    # ------------------------------------------------------------------------
    # NAME
    # ------------------------------------------------------------------------

    supplied_name = getattr(
        user_data,
        "name",
        None,
    )

    if supplied_name is not None:
        user.name = _validate_name(
            supplied_name
        )

    # ------------------------------------------------------------------------
    # EMAIL
    # ------------------------------------------------------------------------

    supplied_email = getattr(
        user_data,
        "email",
        None,
    )

    if supplied_email is not None:

        normalized_email = _validate_email(
            supplied_email
        )

        existing_user = get_user_by_email(
            db,
            normalized_email,
        )

        if (
            existing_user is not None
            and existing_user.id != user.id
        ):
            raise ValueError(
                "Email is already registered."
            )

        user.email = normalized_email

    # ------------------------------------------------------------------------
    # IMPORTANT
    # ------------------------------------------------------------------------
    #
    # DO NOT write these fields until corresponding physical MySQL columns
    # exist:
    #
    #   mobile
    #   phone
    #   job_title
    #   designation
    #   city
    #   state
    #
    # The previous implementation attempted to support them conditionally,
    # but SQLAlchemy may still map those attributes on User and therefore
    # select/update them against the physical table.
    #
    # For the current database schema, they are deliberately ignored.
    #

    try:
        _commit_without_full_user_expiration(
            db,
            user,
        )

    except IntegrityError as exc:
        db.rollback()

        raise ValueError(
            "Unable to update user profile."
        ) from exc

    except Exception:
        db.rollback()
        raise

    return user


# ============================================================================
# CHANGE PASSWORD
# ============================================================================

def change_password(
    db: Session,
    user: User,
    password_data: ChangePasswordRequest,
) -> None:
    """
    Change the authenticated user's password.

    Minimum length:
        8 characters
    """

    if user is None:
        raise ValueError(
            "User is required."
        )

    current_password = _validate_password(
        getattr(
            password_data,
            "current_password",
            "",
        ),
        field_name="Current password",
    )

    new_password = _validate_password(
        getattr(
            password_data,
            "new_password",
            "",
        ),
        field_name="New password",
    )

    # ------------------------------------------------------------------------
    # OPTIONAL CONFIRMATION
    # ------------------------------------------------------------------------

    confirmation = getattr(
        password_data,
        "confirm_password",
        None,
    )

    if confirmation is not None:

        if str(
            confirmation
        ) != new_password:

            raise ValueError(
                "Passwords do not match."
            )

    # ------------------------------------------------------------------------
    # VERIFY CURRENT PASSWORD
    # ------------------------------------------------------------------------

    try:
        password_valid = verify_password(
            current_password,
            user.password_hash,
        )

    except Exception as exc:

        raise ValueError(
            "Unable to verify current password."
        ) from exc

    if not password_valid:
        raise ValueError(
            "Current password is incorrect."
        )

    # ------------------------------------------------------------------------
    # PREVENT SAME PASSWORD
    # ------------------------------------------------------------------------

    try:
        same_password = verify_password(
            new_password,
            user.password_hash,
        )

    except Exception as exc:

        raise ValueError(
            "Unable to validate the new password."
        ) from exc

    if same_password:
        raise ValueError(
            "New password must be different "
            "from the current password."
        )

    # ------------------------------------------------------------------------
    # UPDATE
    # ------------------------------------------------------------------------

    user.password_hash = hash_password(
        new_password
    )

    try:
        _commit_without_full_user_expiration(
            db,
            user,
        )

    except Exception:
        db.rollback()
        raise


# ============================================================================
# LIST USERS
# ============================================================================

def list_users(
    db: Session,
) -> list[User]:
    """
    Return all users ordered by ID.

    Only core database-supported fields are loaded.
    """

    statement = (
        select(User)
        .options(
            *_core_user_load_options()
        )
        .order_by(
            User.id
        )
    )

    return list(
        db.scalars(
            statement
        )
    )


# ============================================================================
# UPDATE USER STATUS
# ============================================================================

def update_user_status(
    db: Session,
    user: User,
    is_active: bool,
) -> User:
    """
    Activate or deactivate a user.
    """

    if user is None:
        raise ValueError(
            "User is required."
        )

    user.is_active = bool(
        is_active
    )

    try:
        _commit_without_full_user_expiration(
            db,
            user,
        )

    except Exception:
        db.rollback()
        raise

    return user


# ============================================================================
# CONTROLLED ROLE ASSIGNMENT
# ============================================================================

def set_user_role(
    db: Session,
    user: User,
    role: str,
) -> User:
    """
    Controlled backend role assignment.

    This function is NOT used by public registration
    or normal profile editing.
    """

    if user is None:
        raise ValueError(
            "User is required."
        )

    normalized_role = normalize_role(
        role
    )

    if normalized_role not in ALLOWED_USER_ROLES:
        raise ValueError(
            "Invalid user role."
        )

    user.role = normalized_role

    try:
        _commit_without_full_user_expiration(
            db,
            user,
        )

    except IntegrityError as exc:
        db.rollback()

        raise ValueError(
            "Unable to update user role."
        ) from exc

    except Exception:
        db.rollback()
        raise

    return user


# ============================================================================
# LIST ADMIN USERS
# ============================================================================

def list_admin_users(
    db: Session,
) -> list[User]:
    """
    Return all users having platform-level admin privileges.

    Only core database-supported User fields are loaded.
    """

    statement = (
        select(User)
        .options(
            *_core_user_load_options()
        )
        .where(
            User.role.in_(
                list(
                    ADMIN_ROLES
                )
            )
        )
        .order_by(
            User.id
        )
    )

    return list(
        db.scalars(
            statement
        )
    )


# ============================================================================
# USER SERIALIZATION HELPERS
# ============================================================================

def get_user_profile_data(
    user: User,
) -> dict[str, Any]:
    """
    Build a safe User Panel profile dictionary.

    Only fields that are guaranteed to exist in the current database
    schema are returned.

    Password hash is never exposed.
    """

    if user is None:
        return {}

    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role": normalize_role(
            user.role
        ),
        "is_active": bool(
            user.is_active
        ),
        "status": (
            "Active"
            if user.is_active
            else "Inactive"
        ),
        "created_at": (
            user.created_at.isoformat()
            if user.created_at
            else None
        ),
        "updated_at": (
            user.updated_at.isoformat()
            if user.updated_at
            else None
        ),
    }


# ============================================================================
# EXPORTS
# ============================================================================

__all__ = [
    "normalize_email",
    "normalize_name",
    "normalize_role",
    "is_privileged_role",
    "user_is_admin",
    "user_is_active",
    "get_user_by_email",
    "get_user_by_id",
    "create_user",
    "update_user",
    "change_password",
    "list_users",
    "update_user_status",
    "set_user_role",
    "list_admin_users",
    "get_user_profile_data",
]