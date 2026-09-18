from __future__ import annotations

import logging
import os

from fastapi import (
    APIRouter,
    Cookie,
    Depends,
    HTTPException,
    Request,
)
from fastapi.security import (
    HTTPAuthorizationCredentials,
)

from sqlalchemy.orm import Session

from auth_service.database import get_db
from auth_service.routes.auth import (
    ACCESS_COOKIE_NAME,
    get_authenticated_user,
    security,
)
from auth_service.services.auth_service import (
    get_user_by_id,
)

from notification_service.schemas import (
    NotificationListResponse,
    NotificationResponse,
)

from notification_service.service import (
    get_notification,
    list_notifications,
    mark_all_notifications_read,
    mark_notification_read,
    mark_notification_unread,
)


# ============================================================================
# LOGGER
# ============================================================================

logger = logging.getLogger(
    "cashguard.notification.routes"
)


# ============================================================================
# ROUTER
# ============================================================================

router = APIRouter(
    prefix="/notifications",
    tags=["Notifications"],
)


# ============================================================================
# DEVELOPMENT AUTH
# ============================================================================

DEV_USER_ID = int(
    os.getenv(
        "CASHGUARD_DEV_USER_ID",
        "1",
    )
)

DEV_MODE = os.getenv(
    "CASHGUARD_ENV",
    "development",
).strip().lower() in {
    "development",
    "dev",
    "local",
}


def _is_local_request(
    request: Request,
) -> bool:
    """
    Detect local development requests safely.

    Handles:
      127.0.0.1
      localhost
      ::1
      IPv4-mapped IPv6 addresses such as ::ffff:127.0.0.1
    """

    host = ""

    if request.client:
        host = str(
            request.client.host or ""
        ).strip().lower()

    if host.startswith(
        "::ffff:"
    ):
        host = host[7:]

    return host in {
        "127.0.0.1",
        "localhost",
        "::1",
    }


def _get_development_user(
    db: Session,
):
    """
    Load the configured development user.
    """

    user = get_user_by_id(
        db,
        DEV_USER_ID,
    )

    if user is None:
        logger.error(
            "[NOTIFICATION AUTH] "
            "Development user not found "
            "user_id=%s",
            DEV_USER_ID,
        )

        raise HTTPException(
            status_code=500,
            detail=(
                "Development authentication user "
                "was not found."
            ),
        )

    if not bool(
        getattr(
            user,
            "is_active",
            False,
        )
    ):
        logger.error(
            "[NOTIFICATION AUTH] "
            "Development user is inactive "
            "user_id=%s",
            DEV_USER_ID,
        )

        raise HTTPException(
            status_code=403,
            detail=(
                "Development authentication user "
                "is inactive."
            ),
        )

    return user


# ============================================================================
# NOTIFICATION AUTHENTICATION
# ============================================================================

def get_notification_current_user(
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
    Notification authentication.

    Development:
        Local requests without a token use DEV_USER_ID.

    Authenticated:
        If a real token/cookie is present, use the normal
        production authentication flow.

    Production/remote:
        No token means normal authentication is required.
    """

    # ------------------------------------------------------------------------
    # DETECT TOKEN
    # ------------------------------------------------------------------------

    bearer_token = ""

    if credentials is not None:
        bearer_token = str(
            credentials.credentials or ""
        ).strip()

    cookie_token = str(
        cashguard_access_token or ""
    ).strip()

    raw_authorization = str(
        request.headers.get(
            "Authorization",
            "",
        )
        or ""
    ).strip()

    # ------------------------------------------------------------------------
    # LOCAL DEVELOPMENT BYPASS
    # ------------------------------------------------------------------------

    has_any_token = bool(
        bearer_token
        or cookie_token
        or raw_authorization
    )

    if (
        DEV_MODE
        and _is_local_request(request)
        and not has_any_token
    ):
        logger.info(
            "[NOTIFICATION AUTH] "
            "Development authentication bypass ENABLED "
            "user_id=%s host=%s",
            DEV_USER_ID,
            (
                request.client.host
                if request.client
                else None
            ),
        )

        return _get_development_user(
            db
        )

    # ------------------------------------------------------------------------
    # NORMAL AUTHENTICATION
    # ------------------------------------------------------------------------

    return get_authenticated_user(
        request=request,
        credentials=credentials,
        cashguard_access_token=(
            cashguard_access_token
        ),
        db=db,
    )


# ============================================================================
# LIST NOTIFICATIONS
# ============================================================================

@router.get(
    "",
    response_model=NotificationListResponse,
)
def get_notifications(
    limit: int = 50,
    offset: int = 0,
    current_user=Depends(
        get_notification_current_user
    ),
    db: Session = Depends(get_db),
):
    if not 1 <= limit <= 100:
        raise HTTPException(
            status_code=422,
            detail=(
                "limit must be between 1 and 100"
            ),
        )

    if offset < 0:
        raise HTTPException(
            status_code=422,
            detail=(
                "offset cannot be negative"
            ),
        )

    items = list_notifications(
        db=db,
        user_id=current_user.id,
        limit=limit,
        offset=offset,
    )

    return NotificationListResponse(
        items=items,
        total=len(items),
        limit=limit,
        offset=offset,
    )


# ============================================================================
# GET SINGLE NOTIFICATION
# ============================================================================

@router.get(
    "/{notification_id}",
    response_model=NotificationResponse,
)
def get_notification_by_id(
    notification_id: str,
    current_user=Depends(
        get_notification_current_user
    ),
    db: Session = Depends(get_db),
):
    notification = get_notification(
        db=db,
        notification_id=notification_id,
        user_id=current_user.id,
    )

    if notification is None:
        raise HTTPException(
            status_code=404,
            detail="Notification not found",
        )

    return notification


# ============================================================================
# MARK NOTIFICATION AS READ
# ============================================================================

@router.patch(
    "/{notification_id}/read",
    response_model=NotificationResponse,
)
def read_notification(
    notification_id: str,
    current_user=Depends(
        get_notification_current_user
    ),
    db: Session = Depends(get_db),
):
    notification = get_notification(
        db=db,
        notification_id=notification_id,
        user_id=current_user.id,
    )

    if notification is None:
        raise HTTPException(
            status_code=404,
            detail="Notification not found",
        )

    return mark_notification_read(
        db=db,
        notification=notification,
    )


# ============================================================================
# MARK NOTIFICATION AS UNREAD
# ============================================================================

@router.patch(
    "/{notification_id}/unread",
    response_model=NotificationResponse,
)
def unread_notification(
    notification_id: str,
    current_user=Depends(
        get_notification_current_user
    ),
    db: Session = Depends(get_db),
):
    notification = get_notification(
        db=db,
        notification_id=notification_id,
        user_id=current_user.id,
    )

    if notification is None:
        raise HTTPException(
            status_code=404,
            detail="Notification not found",
        )

    return mark_notification_unread(
        db=db,
        notification=notification,
    )


# ============================================================================
# MARK ALL NOTIFICATIONS AS READ
# ============================================================================

@router.post(
    "/mark-all-read",
)
def read_all_notifications(
    current_user=Depends(
        get_notification_current_user
    ),
    db: Session = Depends(get_db),
):
    updated_count = mark_all_notifications_read(
        db=db,
        user_id=current_user.id,
    )

    return {
        "success": True,
        "updated_count": updated_count,
        "message": (
            "All notifications marked as read."
        ),
    }