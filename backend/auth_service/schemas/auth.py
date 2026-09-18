from __future__ import annotations

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    field_validator,
)


# ============================================================================
# ROLE HELPERS
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

USER_ROLES = {
    "user",
    *ADMIN_ROLES,
}


def normalize_role(
    role: object,
) -> str:
    return (
        str(role or "")
        .strip()
        .lower()
        or "user"
    )


def is_admin_role(
    role: object,
) -> bool:
    return (
        normalize_role(role)
        in ADMIN_ROLES
    )


# ============================================================================
# USER REGISTER
# ============================================================================

class UserRegister(BaseModel):
    """
    Public registration request.

    Public registration can only create a normal user.
    """

    name: str = Field(
        ...,
        min_length=2,
        max_length=100,
        description="User full name.",
    )

    email: EmailStr = Field(
        ...,
        description="User email address.",
    )

    password: str = Field(
        ...,
        min_length=8,
        max_length=72,
        description="User password.",
    )

    @field_validator("name")
    @classmethod
    def normalize_name(
        cls,
        value: str,
    ) -> str:
        value = value.strip()

        if len(value) < 2:
            raise ValueError(
                "Name must contain at least 2 characters."
            )

        return value

    @field_validator("email")
    @classmethod
    def normalize_email(
        cls,
        value: EmailStr,
    ) -> str:
        return (
            str(value)
            .strip()
            .lower()
        )


# ============================================================================
# USER LOGIN
# ============================================================================

class UserLogin(BaseModel):
    email: EmailStr = Field(
        ...,
        description="Registered user email.",
    )

    password: str = Field(
        ...,
        min_length=8,
        max_length=72,
        description="User password.",
    )

    @field_validator("email")
    @classmethod
    def normalize_email(
        cls,
        value: EmailStr,
    ) -> str:
        return (
            str(value)
            .strip()
            .lower()
        )


# ============================================================================
# USER RESPONSE
# ============================================================================

class UserResponse(BaseModel):
    """
    Authenticated user response.

    Current database-backed fields are exposed directly.
    Optional profile fields are supported when the model contains them.
    """

    id: int

    name: str

    email: EmailStr

    role: str

    is_active: bool

    # Optional User Panel fields.
    mobile: str | None = None
    job_title: str | None = None
    city: str | None = None
    state: str | None = None

    created_at: str | None = None
    updated_at: str | None = None

    is_admin: bool = False
    is_owner: bool = False
    normalized_role: str = "user"

    model_config = ConfigDict(
        from_attributes=True,
    )

    def model_post_init(
        self,
        __context,
    ) -> None:
        normalized = normalize_role(
            self.role
        )

        object.__setattr__(
            self,
            "normalized_role",
            normalized,
        )

        object.__setattr__(
            self,
            "is_admin",
            is_admin_role(
                normalized
            ),
        )

        object.__setattr__(
            self,
            "is_owner",
            normalized == "owner",
        )


# ============================================================================
# TOKEN RESPONSE
# ============================================================================

class TokenResponse(BaseModel):
    access_token: str

    token_type: str = "bearer"

    expires_in: int


# ============================================================================
# MESSAGE RESPONSE
# ============================================================================

class MessageResponse(BaseModel):
    message: str


# ============================================================================
# USER UPDATE
# ============================================================================

class UserUpdate(BaseModel):
    """
    User Panel profile update.

    Role and is_active are deliberately excluded.
    """

    name: str | None = Field(
        default=None,
        min_length=2,
        max_length=100,
    )

    email: EmailStr | None = None

    mobile: str | None = Field(
        default=None,
        max_length=30,
    )

    job_title: str | None = Field(
        default=None,
        max_length=100,
    )

    city: str | None = Field(
        default=None,
        max_length=100,
    )

    state: str | None = Field(
        default=None,
        max_length=100,
    )

    @field_validator("name")
    @classmethod
    def validate_name(
        cls,
        value: str | None,
    ) -> str | None:
        if value is None:
            return None

        normalized = value.strip()

        if len(normalized) < 2:
            raise ValueError(
                "Name must contain at least 2 characters."
            )

        return normalized

    @field_validator("email")
    @classmethod
    def validate_email(
        cls,
        value: EmailStr | None,
    ) -> str | None:
        if value is None:
            return None

        return (
            str(value)
            .strip()
            .lower()
        )

    @field_validator(
        "mobile",
        "job_title",
        "city",
        "state",
    )
    @classmethod
    def normalize_optional_text(
        cls,
        value: str | None,
    ) -> str | None:
        if value is None:
            return None

        return value.strip()


# ============================================================================
# CHANGE PASSWORD
# ============================================================================

class ChangePasswordRequest(BaseModel):
    current_password: str = Field(
        ...,
        min_length=8,
        max_length=72,
    )

    new_password: str = Field(
        ...,
        min_length=8,
        max_length=72,
    )

    confirm_password: str | None = Field(
        default=None,
        min_length=8,
        max_length=72,
    )

    @field_validator("new_password")
    @classmethod
    def validate_new_password(
        cls,
        value: str,
    ) -> str:
        if len(value) < 8:
            raise ValueError(
                "New password must contain at least 8 characters."
            )

        return value

    @field_validator("confirm_password")
    @classmethod
    def validate_confirmation(
        cls,
        value: str | None,
    ) -> str | None:
        if value is None:
            return None

        return value


# ============================================================================
# USER STATUS UPDATE
# ============================================================================

class UserStatusUpdate(BaseModel):
    is_active: bool


# ============================================================================
# ADMIN USER RESPONSE
# ============================================================================

class AdminUserResponse(BaseModel):
    id: int

    name: str

    email: EmailStr

    role: str

    is_active: bool

    mobile: str | None = None
    job_title: str | None = None
    city: str | None = None
    state: str | None = None

    created_at: str | None = None
    updated_at: str | None = None

    is_admin: bool = False
    is_owner: bool = False
    normalized_role: str = "user"

    model_config = ConfigDict(
        from_attributes=True,
    )

    def model_post_init(
        self,
        __context,
    ) -> None:
        normalized = normalize_role(
            self.role
        )

        object.__setattr__(
            self,
            "normalized_role",
            normalized,
        )

        object.__setattr__(
            self,
            "is_admin",
            is_admin_role(
                normalized
            ),
        )

        object.__setattr__(
            self,
            "is_owner",
            normalized == "owner",
        )


# ============================================================================
# ADMIN ROLE UPDATE
# ============================================================================

class AdminRoleUpdateRequest(BaseModel):
    role: str = Field(
        ...,
        min_length=1,
        max_length=50,
    )

    @field_validator("role")
    @classmethod
    def validate_role(
        cls,
        value: str,
    ) -> str:
        normalized = normalize_role(
            value
        )

        if normalized not in USER_ROLES:
            raise ValueError(
                "Invalid user role."
            )

        return normalized


# ============================================================================
# EXPORTS
# ============================================================================

__all__ = [
    "ADMIN_ROLES",
    "USER_ROLES",
    "normalize_role",
    "is_admin_role",
    "UserRegister",
    "UserLogin",
    "UserResponse",
    "TokenResponse",
    "MessageResponse",
    "UserUpdate",
    "ChangePasswordRequest",
    "UserStatusUpdate",
    "AdminUserResponse",
    "AdminRoleUpdateRequest",
]