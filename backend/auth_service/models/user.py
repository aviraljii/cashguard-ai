from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from auth_service.database import Base


class User(Base):
    """
    CashGuard-AI User Model

    Authentication:
        - id
        - name
        - email
        - password_hash

    User profile:
        - mobile
        - job_title
        - city
        - state

    Authorization:
        - role
        - is_active

    Timestamps:
        - created_at
        - updated_at
    """

    __tablename__ = "users"

    # -------------------------------------------------------------------------
    # PRIMARY KEY
    # -------------------------------------------------------------------------

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
        autoincrement=True,
    )

    # -------------------------------------------------------------------------
    # BASIC USER INFORMATION
    # -------------------------------------------------------------------------

    name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    email: Mapped[str] = mapped_column(
        String(255),
        unique=True,
        nullable=False,
        index=True,
    )

    password_hash: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    # -------------------------------------------------------------------------
    # USER PANEL PROFILE
    # -------------------------------------------------------------------------

    mobile: Mapped[str | None] = mapped_column(
        String(30),
        nullable=True,
        default=None,
    )

    job_title: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
        default=None,
    )

    city: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
        default=None,
    )

    state: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
        default=None,
    )

    # -------------------------------------------------------------------------
    # AUTHORIZATION
    # -------------------------------------------------------------------------

    role: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="user",
        server_default="user",
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default="1",
    )

    # -------------------------------------------------------------------------
    # TIMESTAMPS
    # -------------------------------------------------------------------------

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # -------------------------------------------------------------------------
    # ROLE HELPERS
    # -------------------------------------------------------------------------

    @property
    def normalized_role(self) -> str:
        """Return a clean normalized role."""
        return (self.role or "user").strip().lower()

    @property
    def is_admin(self) -> bool:
        """Return True when the user has administrator privileges."""
        return self.normalized_role in {
            "admin",
            "administrator",
            "owner",
            "super_admin",
            "superadmin",
            "platform_admin",
            "platform-admin",
        }

    @property
    def is_owner(self) -> bool:
        """Return True when the user is an owner."""
        return self.normalized_role == "owner"

    # -------------------------------------------------------------------------
    # SAFE PROFILE RESPONSE
    # -------------------------------------------------------------------------

    def to_profile_dict(self) -> dict[str, object]:
        """
        Return safe user profile data.

        password_hash is never returned.
        """

        created_at = (
            self.created_at.isoformat()
            if self.created_at
            else None
        )

        updated_at = (
            self.updated_at.isoformat()
            if self.updated_at
            else None
        )

        return {
            "id": self.id,
            "name": self.name,
            "email": self.email,
            "mobile": self.mobile,
            "job_title": self.job_title,
            "city": self.city,
            "state": self.state,
            "role": self.normalized_role,
            "is_active": bool(self.is_active),
            "status": "Active" if self.is_active else "Inactive",
            "member_since": created_at,
            "created_at": created_at,
            "updated_at": updated_at,
            "is_admin": self.is_admin,
            "is_owner": self.is_owner,
        }

    # -------------------------------------------------------------------------
    # REPRESENTATION
    # -------------------------------------------------------------------------

    def __repr__(self) -> str:
        return (
            "<User("
            f"id={self.id!r}, "
            f"name={self.name!r}, "
            f"email={self.email!r}, "
            f"role={self.role!r}, "
            f"is_active={self.is_active!r}"
            ")>"
        )