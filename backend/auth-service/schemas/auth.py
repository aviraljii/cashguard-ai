from __future__ import annotations

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
)


# ==================================================================
# USER REGISTER
# ==================================================================


class UserRegister(BaseModel):
    """
    Request schema for creating a new user.
    """

    name: str = Field(
        ...,
        min_length=2,
        max_length=100,
        description="Full name of the user.",
    )

    email: EmailStr = Field(
        ...,
        description="Valid email address.",
    )

    password: str = Field(
        ...,
        min_length=8,
        max_length=72,
        description="User password.",
    )


# ==================================================================
# USER LOGIN
# ==================================================================


class UserLogin(BaseModel):
    """
    Request schema for user login.

    Expected JSON:

    {
        "email": "user@example.com",
        "password": "password123"
    }
    """

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


# ==================================================================
# USER RESPONSE
# ==================================================================


class UserResponse(BaseModel):
    """
    Public user response.
    """

    id: int

    name: str

    email: EmailStr

    role: str

    is_active: bool

    model_config = ConfigDict(
        from_attributes=True,
    )


# ==================================================================
# TOKEN RESPONSE
# ==================================================================


class TokenResponse(BaseModel):
    """
    JWT authentication response.
    """

    access_token: str = Field(
        ...,
        description="JWT access token.",
    )

    token_type: str = Field(
        default="bearer",
        description="Authentication scheme.",
    )

    expires_in: int = Field(
        ...,
        ge=1,
        description="Token lifetime in seconds.",
    )


# ==================================================================
# GENERIC MESSAGE RESPONSE
# ==================================================================


class MessageResponse(BaseModel):
    """
    Generic API message response.
    """

    message: str