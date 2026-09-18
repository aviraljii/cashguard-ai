from __future__ import annotations

import json
import logging
import uuid

from datetime import datetime
from typing import Any

from fastapi import (
    APIRouter,
    Body,
    Depends,
    HTTPException,
    Request,
)
from sqlalchemy import text
from sqlalchemy.orm import Session

from auth_service.database import (
    get_db,
)

from auth_service.routes.auth import (
    get_authenticated_user,
)


# ============================================================================
# LOGGER
# ============================================================================

logger = logging.getLogger(
    "cashguard.user_panel.routes"
)


# ============================================================================
# ROUTER
# ============================================================================
#
# IMPORTANT:
# main.py mounts this router with:
#
#     app.include_router(
#         user_panel_router,
#         prefix="/api",
#     )
#
# Therefore:
#
#     /auth/preferences
#     becomes:
#     /api/auth/preferences
#
# This matches the existing User Panel frontend contract.
# ============================================================================

router = APIRouter(
    prefix="/auth",
    tags=["User Panel"],
)


# ============================================================================
# INTERNAL DATABASE INITIALIZATION
# ============================================================================

def _ensure_user_panel_tables(
    db: Session,
) -> None:
    """
    Create User Panel support tables when they do not already exist.

    These tables are intentionally separate from the existing authentication
    schema so the current users/JWT implementation remains untouched.
    """

    # ------------------------------------------------------------------------
    # USER PANEL SETTINGS
    # ------------------------------------------------------------------------

    db.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS user_panel_settings (
                user_id BIGINT NOT NULL,
                setting_group VARCHAR(50) NOT NULL,
                payload JSON NULL,
                updated_at DATETIME NOT NULL
                    DEFAULT CURRENT_TIMESTAMP
                    ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (
                    user_id,
                    setting_group
                )
            )
            """
        )
    )

    # ------------------------------------------------------------------------
    # USER PANEL SESSIONS
    # ------------------------------------------------------------------------

    db.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS user_panel_sessions (
                id VARCHAR(64) NOT NULL,
                user_id BIGINT NOT NULL,
                session_name VARCHAR(255) NULL,
                device VARCHAR(255) NULL,
                ip_address VARCHAR(64) NULL,
                user_agent VARCHAR(1000) NULL,
                is_current TINYINT(1) NOT NULL DEFAULT 0,
                created_at DATETIME NOT NULL
                    DEFAULT CURRENT_TIMESTAMP,
                last_seen_at DATETIME NOT NULL
                    DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                INDEX idx_user_panel_sessions_user (
                    user_id
                )
            )
            """
        )
    )

    # ------------------------------------------------------------------------
    # USER PANEL ACTIVITY
    # ------------------------------------------------------------------------

    db.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS user_panel_activity (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                user_id BIGINT NOT NULL,
                action VARCHAR(255) NOT NULL,
                description TEXT NULL,
                metadata JSON NULL,
                created_at DATETIME NOT NULL
                    DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_user_panel_activity_user (
                    user_id
                )
            )
            """
        )
    )

    # ------------------------------------------------------------------------
    # USER PANEL TEAM
    # ------------------------------------------------------------------------

    db.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS user_panel_team (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                owner_user_id BIGINT NOT NULL,
                email VARCHAR(320) NOT NULL,
                role VARCHAR(100) NOT NULL DEFAULT 'member',
                status VARCHAR(50) NOT NULL DEFAULT 'invited',
                created_at DATETIME NOT NULL
                    DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uq_user_panel_team_owner_email (
                    owner_user_id,
                    email
                ),
                INDEX idx_user_panel_team_owner (
                    owner_user_id
                )
            )
            """
        )
    )

    db.commit()


# ============================================================================
# SERIALIZATION HELPERS
# ============================================================================

def _json_load(
    value: Any,
    default: Any,
) -> Any:
    """
    Safely deserialize a JSON database value.
    """

    if value is None:
        return default

    if isinstance(
        value,
        (dict, list),
    ):
        return value

    try:
        return json.loads(
            str(value)
        )
    except Exception:
        return default


def _iso(
    value: Any,
) -> str | None:
    """
    Convert datetime-like values to ISO strings.
    """

    if value is None:
        return None

    if isinstance(
        value,
        datetime,
    ):
        return value.isoformat()

    return str(value)


# ============================================================================
# ACTIVITY HELPER
# ============================================================================

def _record_activity(
    db: Session,
    user_id: int,
    action: str,
    description: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    """
    Store a User Panel activity entry.
    """

    db.execute(
        text(
            """
            INSERT INTO user_panel_activity (
                user_id,
                action,
                description,
                metadata
            )
            VALUES (
                :user_id,
                :action,
                :description,
                :metadata
            )
            """
        ),
        {
            "user_id":
                user_id,
            "action":
                action,
            "description":
                description,
            "metadata":
                json.dumps(
                    metadata or {},
                    default=str,
                ),
        },
    )


# ============================================================================
# SETTINGS HELPERS
# ============================================================================

def _save_setting(
    db: Session,
    user_id: int,
    setting_group: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    """
    Insert or update a User Panel settings record.
    """

    payload_json = json.dumps(
        payload,
        default=str,
    )

    db.execute(
        text(
            """
            INSERT INTO user_panel_settings (
                user_id,
                setting_group,
                payload,
                updated_at
            )
            VALUES (
                :user_id,
                :setting_group,
                :payload,
                CURRENT_TIMESTAMP
            )
            ON DUPLICATE KEY UPDATE
                payload = VALUES(payload),
                updated_at = CURRENT_TIMESTAMP
            """
        ),
        {
            "user_id":
                user_id,
            "setting_group":
                setting_group,
            "payload":
                payload_json,
        },
    )

    return payload


def _get_setting(
    db: Session,
    user_id: int,
    setting_group: str,
    default: dict[str, Any],
) -> dict[str, Any]:
    """
    Read a User Panel settings record.
    """

    row = db.execute(
        text(
            """
            SELECT payload
            FROM user_panel_settings
            WHERE user_id = :user_id
              AND setting_group = :setting_group
            LIMIT 1
            """
        ),
        {
            "user_id":
                user_id,
            "setting_group":
                setting_group,
        },
    ).fetchone()

    if row is None:
        return dict(default)

    value = _json_load(
        row._mapping.get(
            "payload"
        ),
        default,
    )

    if isinstance(
        value,
        dict,
    ):
        return value

    return dict(default)


# ============================================================================
# DEFAULT SETTINGS
# ============================================================================

DEFAULT_PREFERENCES = {
    "currency":
        "INR",
    "timezone":
        "Asia/Kolkata",
    "date_format":
        "DD/MM/YYYY",
    "language":
        "en-IN",
}


DEFAULT_NOTIFICATIONS = {
    "email":
        True,
    "push":
        True,
    "invoice_due":
        True,
    "payment_received":
        True,
    "cash_flow_alerts":
        True,
    "risk_alerts":
        True,
}


DEFAULT_AI_SETTINGS = {
    "enabled":
        True,
    "risk_monitoring":
        True,
    "cash_flow_insights":
        True,
    "payment_delay_prediction":
        True,
    "proactive_recommendations":
        True,
}


# ============================================================================
# BUSINESS PROFILE
# ============================================================================

@router.get(
    "/business",
)
def get_business_profile(
    current_user=Depends(
        get_authenticated_user
    ),
    db: Session = Depends(
        get_db
    ),
) -> dict[str, Any]:
    """
    Return the authenticated user's business profile.

    The project may have different businesses-table structures across
    versions, so this function detects the available columns first.
    """

    user_id = int(
        current_user.id
    )

    try:

        # --------------------------------------------------------------------
        # CHECK BUSINESSES TABLE
        # --------------------------------------------------------------------

        table_exists = db.execute(
            text(
                """
                SELECT COUNT(*)
                FROM information_schema.tables
                WHERE table_schema = DATABASE()
                  AND table_name = 'businesses'
                """
            )
        ).scalar()

        if int(
            table_exists or 0
        ) > 0:

            # ---------------------------------------------------------------
            # GET AVAILABLE COLUMNS
            # ---------------------------------------------------------------

            columns = db.execute(
                text(
                    """
                    SELECT COLUMN_NAME
                    FROM information_schema.columns
                    WHERE table_schema = DATABASE()
                      AND table_name = 'businesses'
                    ORDER BY ORDINAL_POSITION
                    """
                )
            ).scalars().all()

            columns = [
                str(column)
                for column in columns
            ]

            if columns:

                # -----------------------------------------------------------
                # POSSIBLE ID COLUMN
                # -----------------------------------------------------------

                id_column = next(
                    (
                        column
                        for column in (
                            "id",
                            "business_id",
                            "uuid",
                        )
                        if column in columns
                    ),
                    None,
                )

                # -----------------------------------------------------------
                # POSSIBLE OWNER COLUMN
                # -----------------------------------------------------------

                owner_column = next(
                    (
                        column
                        for column in (
                            "owner_user_id",
                            "user_id",
                            "created_by",
                            "created_by_user_id",
                        )
                        if column in columns
                    ),
                    None,
                )

                # -----------------------------------------------------------
                # POSSIBLE NAME COLUMN
                # -----------------------------------------------------------

                name_column = next(
                    (
                        column
                        for column in (
                            "business_name",
                            "name",
                            "company_name",
                        )
                        if column in columns
                    ),
                    None,
                )

                # -----------------------------------------------------------
                # SAFE SELECT
                # -----------------------------------------------------------

                safe_select = ", ".join(
                    f"`{column}`"
                    for column in columns
                )

                row = None

                # -----------------------------------------------------------
                # OWNER-BASED QUERY
                # -----------------------------------------------------------

                if owner_column:

                    row = db.execute(
                        text(
                            f"""
                            SELECT {safe_select}
                            FROM businesses
                            WHERE `{owner_column}` = :user_id
                            LIMIT 1
                            """
                        ),
                        {
                            "user_id":
                                user_id,
                        },
                    ).fetchone()

                # -----------------------------------------------------------
                # FALLBACK QUERY
                # -----------------------------------------------------------

                else:

                    row = db.execute(
                        text(
                            f"""
                            SELECT {safe_select}
                            FROM businesses
                            LIMIT 1
                            """
                        )
                    ).fetchone()

                # -----------------------------------------------------------
                # RETURN BUSINESS
                # -----------------------------------------------------------

                if row is not None:

                    business = {}

                    for (
                        key,
                        value,
                    ) in row._mapping.items():

                        business[key] = (
                            _iso(value)
                            if isinstance(
                                value,
                                datetime,
                            )
                            else value
                        )

                    business_id = (
                        business.get(
                            id_column
                        )
                        if id_column
                        else None
                    )

                    business_name = (
                        business.get(
                            name_column
                        )
                        if name_column
                        else None
                    )

                    return {
                        "status":
                            "success",
                        "business": {
                            **business,
                            "business_id": (
                                str(
                                    business_id
                                )
                                if business_id
                                is not None
                                else None
                            ),
                            "name": (
                                business_name
                                or
                                "CashGuard Business"
                            ),
                        },
                    }

    except Exception:

        logger.exception(
            "Existing businesses table could not be read."
        )

        db.rollback()

    # ------------------------------------------------------------------------
    # SAFE FALLBACK
    # ------------------------------------------------------------------------

    return {
        "status":
            "success",
        "business": {
            "business_id":
                None,
            "name": (
                f"{current_user.name}'s Business"
                if getattr(
                    current_user,
                    "name",
                    None,
                )
                else "CashGuard Business"
            ),
            "owner_user_id":
                user_id,
            "email":
                current_user.email,
            "city":
                getattr(
                    current_user,
                    "city",
                    None,
                ),
            "state":
                getattr(
                    current_user,
                    "state",
                    None,
                ),
        },
    }


# ============================================================================
# PREFERENCES
# ============================================================================

@router.get(
    "/preferences",
)
def get_preferences(
    current_user=Depends(
        get_authenticated_user
    ),
    db: Session = Depends(
        get_db
    ),
) -> dict[str, Any]:

    _ensure_user_panel_tables(
        db
    )

    preferences = _get_setting(
        db,
        current_user.id,
        "preferences",
        DEFAULT_PREFERENCES,
    )

    return {
        "status":
            "success",
        "preferences":
            preferences,
    }


@router.put(
    "/preferences",
)
def update_preferences(
    payload: dict[str, Any] = Body(
        default={}
    ),
    current_user=Depends(
        get_authenticated_user
    ),
    db: Session = Depends(
        get_db
    ),
) -> dict[str, Any]:

    _ensure_user_panel_tables(
        db
    )

    current = _get_setting(
        db,
        current_user.id,
        "preferences",
        DEFAULT_PREFERENCES,
    )

    if payload:
        current.update(
            payload
        )

    saved = _save_setting(
        db,
        current_user.id,
        "preferences",
        current,
    )

    _record_activity(
        db,
        current_user.id,
        "preferences_updated",
        "Workspace preferences updated.",
        saved,
    )

    db.commit()

    return {
        "status":
            "success",
        "message":
            "Preferences updated successfully.",
        "preferences":
            saved,
    }


# ============================================================================
# NOTIFICATIONS
# ============================================================================

@router.get(
    "/notifications",
)
def get_notification_preferences(
    current_user=Depends(
        get_authenticated_user
    ),
    db: Session = Depends(
        get_db
    ),
) -> dict[str, Any]:

    _ensure_user_panel_tables(
        db
    )

    notifications = _get_setting(
        db,
        current_user.id,
        "notifications",
        DEFAULT_NOTIFICATIONS,
    )

    return {
        "status":
            "success",
        "notifications":
            notifications,
    }


@router.put(
    "/notifications",
)
def update_notification_preferences(
    payload: dict[str, Any] = Body(
        default={}
    ),
    current_user=Depends(
        get_authenticated_user
    ),
    db: Session = Depends(
        get_db
    ),
) -> dict[str, Any]:

    _ensure_user_panel_tables(
        db
    )

    current = _get_setting(
        db,
        current_user.id,
        "notifications",
        DEFAULT_NOTIFICATIONS,
    )

    if payload:
        current.update(
            payload
        )

    saved = _save_setting(
        db,
        current_user.id,
        "notifications",
        current,
    )

    _record_activity(
        db,
        current_user.id,
        "notification_preferences_updated",
        "Notification preferences updated.",
        saved,
    )

    db.commit()

    return {
        "status":
            "success",
        "message":
            "Notification preferences updated successfully.",
        "notifications":
            saved,
    }


# ============================================================================
# SESSIONS
# ============================================================================

@router.get(
    "/sessions",
)
def get_sessions(
    request: Request,
    current_user=Depends(
        get_authenticated_user
    ),
    db: Session = Depends(
        get_db
    ),
) -> dict[str, Any]:

    _ensure_user_panel_tables(
        db
    )

    existing = db.execute(
        text(
            """
            SELECT
                id,
                session_name,
                device,
                ip_address,
                user_agent,
                is_current,
                created_at,
                last_seen_at
            FROM user_panel_sessions
            WHERE user_id = :user_id
            ORDER BY last_seen_at DESC
            """
        ),
        {
            "user_id":
                current_user.id,
        },
    ).fetchall()

    # ------------------------------------------------------------------------
    # CREATE CURRENT SESSION RECORD WHEN FIRST OPENED
    # ------------------------------------------------------------------------

    if not existing:

        session_id = str(
            uuid.uuid4()
        )

        db.execute(
            text(
                """
                INSERT INTO user_panel_sessions (
                    id,
                    user_id,
                    session_name,
                    device,
                    ip_address,
                    user_agent,
                    is_current
                )
                VALUES (
                    :id,
                    :user_id,
                    :session_name,
                    :device,
                    :ip_address,
                    :user_agent,
                    1
                )
                """
            ),
            {
                "id":
                    session_id,
                "user_id":
                    current_user.id,
                "session_name":
                    "Current browser session",
                "device":
                    "Web browser",
                "ip_address": (
                    request.client.host
                    if request.client
                    else None
                ),
                "user_agent":
                    request.headers.get(
                        "user-agent"
                    ),
            },
        )

        db.commit()

        existing = db.execute(
            text(
                """
                SELECT
                    id,
                    session_name,
                    device,
                    ip_address,
                    user_agent,
                    is_current,
                    created_at,
                    last_seen_at
                FROM user_panel_sessions
                WHERE user_id = :user_id
                ORDER BY last_seen_at DESC
                """
            ),
            {
                "user_id":
                    current_user.id,
            },
        ).fetchall()

    sessions = []

    for row in existing:

        data = dict(
            row._mapping
        )

        data["is_current"] = bool(
            data.get(
                "is_current"
            )
        )

        data["created_at"] = _iso(
            data.get(
                "created_at"
            )
        )

        data["last_seen_at"] = _iso(
            data.get(
                "last_seen_at"
            )
        )

        sessions.append(
            data
        )

    return {
        "status":
            "success",
        "sessions":
            sessions,
    }


@router.delete(
    "/sessions/{session_id}",
)
def delete_session(
    session_id: str,
    current_user=Depends(
        get_authenticated_user
    ),
    db: Session = Depends(
        get_db
    ),
) -> dict[str, Any]:

    _ensure_user_panel_tables(
        db
    )

    normalized_session_id = (
        str(
            session_id
        ).strip()
    )

    if not normalized_session_id:
        raise HTTPException(
            status_code=400,
            detail="session_id is required.",
        )

    result = db.execute(
        text(
            """
            DELETE FROM user_panel_sessions
            WHERE id = :session_id
              AND user_id = :user_id
              AND is_current = 0
            """
        ),
        {
            "session_id":
                normalized_session_id,
            "user_id":
                current_user.id,
        },
    )

    db.commit()

    if result.rowcount == 0:

        raise HTTPException(
            status_code=404,
            detail=(
                "Session not found or the current "
                "session cannot be revoked."
            ),
        )

    return {
        "status":
            "success",
        "message":
            "Session revoked successfully.",
        "session_id":
            normalized_session_id,
    }


# ============================================================================
# SERVICES
# ============================================================================

@router.get(
    "/services",
)
def get_services(
    current_user=Depends(
        get_authenticated_user
    ),
) -> dict[str, Any]:

    return {
        "status":
            "success",
        "services": [
            {
                "id":
                    "cash-flow",
                "name":
                    "Cash Flow Monitoring",
                "enabled":
                    True,
                "status":
                    "active",
            },
            {
                "id":
                    "payment-risk",
                "name":
                    "Payment Risk Intelligence",
                "enabled":
                    True,
                "status":
                    "active",
            },
            {
                "id":
                    "ai-insights",
                "name":
                    "AI Business Insights",
                "enabled":
                    True,
                "status":
                    "active",
            },
            {
                "id":
                    "notifications",
                "name":
                    "Notifications",
                "enabled":
                    True,
                "status":
                    "active",
            },
        ],
    }


# ============================================================================
# ACTIVITY
# ============================================================================

@router.get(
    "/activity",
)
def get_activity(
    current_user=Depends(
        get_authenticated_user
    ),
    db: Session = Depends(
        get_db
    ),
) -> dict[str, Any]:

    _ensure_user_panel_tables(
        db
    )

    rows = db.execute(
        text(
            """
            SELECT
                id,
                action,
                description,
                metadata,
                created_at
            FROM user_panel_activity
            WHERE user_id = :user_id
            ORDER BY created_at DESC
            LIMIT 100
            """
        ),
        {
            "user_id":
                current_user.id,
        },
    ).fetchall()

    activity = []

    for row in rows:

        item = dict(
            row._mapping
        )

        item["metadata"] = _json_load(
            item.get(
                "metadata"
            ),
            {},
        )

        item["created_at"] = _iso(
            item.get(
                "created_at"
            )
        )

        activity.append(
            item
        )

    return {
        "status":
            "success",
        "activity":
            activity,
    }


# ============================================================================
# TEAM
# ============================================================================

@router.get(
    "/team",
)
def get_team(
    current_user=Depends(
        get_authenticated_user
    ),
    db: Session = Depends(
        get_db
    ),
) -> dict[str, Any]:

    _ensure_user_panel_tables(
        db
    )

    rows = db.execute(
        text(
            """
            SELECT
                id,
                email,
                role,
                status,
                created_at
            FROM user_panel_team
            WHERE owner_user_id = :user_id
            ORDER BY created_at DESC
            """
        ),
        {
            "user_id":
                current_user.id,
        },
    ).fetchall()

    members = []

    for row in rows:

        member = dict(
            row._mapping
        )

        member["created_at"] = _iso(
            member.get(
                "created_at"
            )
        )

        members.append(
            member
        )

    return {
        "status":
            "success",
        "team":
            members,
    }


@router.post(
    "/team",
)
def invite_team_member(
    payload: dict[str, Any] = Body(
        default={}
    ),
    current_user=Depends(
        get_authenticated_user
    ),
    db: Session = Depends(
        get_db
    ),
) -> dict[str, Any]:

    _ensure_user_panel_tables(
        db
    )

    email = str(
        payload.get(
            "email",
            "",
        )
    ).strip().lower()

    role = str(
        payload.get(
            "role",
            "member",
        )
    ).strip()

    if not role:
        role = "member"

    if not email:

        raise HTTPException(
            status_code=422,
            detail=(
                "Team member email is required."
            ),
        )

    db.execute(
        text(
            """
            INSERT INTO user_panel_team (
                owner_user_id,
                email,
                role,
                status
            )
            VALUES (
                :owner_user_id,
                :email,
                :role,
                'invited'
            )
            ON DUPLICATE KEY UPDATE
                role = VALUES(role),
                status = 'invited'
            """
        ),
        {
            "owner_user_id":
                current_user.id,
            "email":
                email,
            "role":
                role,
        },
    )

    _record_activity(
        db,
        current_user.id,
        "team_invitation_created",
        f"Team invitation created for {email}.",
        {
            "email":
                email,
            "role":
                role,
        },
    )

    db.commit()

    return {
        "status":
            "success",
        "message":
            "Team invitation created successfully.",
        "member": {
            "email":
                email,
            "role":
                role,
            "status":
                "invited",
        },
    }


# ============================================================================
# AI SETTINGS
# ============================================================================

@router.get(
    "/ai-settings",
)
def get_ai_settings(
    current_user=Depends(
        get_authenticated_user
    ),
    db: Session = Depends(
        get_db
    ),
) -> dict[str, Any]:

    _ensure_user_panel_tables(
        db
    )

    ai_settings = _get_setting(
        db,
        current_user.id,
        "ai_settings",
        DEFAULT_AI_SETTINGS,
    )

    return {
        "status":
            "success",
        "ai_settings":
            ai_settings,
    }


@router.put(
    "/ai-settings",
)
def update_ai_settings(
    payload: dict[str, Any] = Body(
        default={}
    ),
    current_user=Depends(
        get_authenticated_user
    ),
    db: Session = Depends(
        get_db
    ),
) -> dict[str, Any]:

    _ensure_user_panel_tables(
        db
    )

    current = _get_setting(
        db,
        current_user.id,
        "ai_settings",
        DEFAULT_AI_SETTINGS,
    )

    if payload:
        current.update(
            payload
        )

    saved = _save_setting(
        db,
        current_user.id,
        "ai_settings",
        current,
    )

    _record_activity(
        db,
        current_user.id,
        "ai_settings_updated",
        "AI workspace settings updated.",
        saved,
    )

    db.commit()

    return {
        "status":
            "success",
        "message":
            "AI settings updated successfully.",
        "ai_settings":
            saved,
    }


# ============================================================================
# USER PANEL HEALTH
# ============================================================================

@router.get(
    "/health",
)
def user_panel_health(
    current_user=Depends(
        get_authenticated_user
    ),
) -> dict[str, Any]:

    return {
        "status":
            "success",
        "service":
            "CashGuard-AI User Panel API",
        "user_id":
            current_user.id,
    }