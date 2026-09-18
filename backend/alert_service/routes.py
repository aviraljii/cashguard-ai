from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
)
from sqlalchemy.orm import Session

from auth_service.database import get_db
from auth_service.routes.auth import (
    get_authenticated_user,
)

from alert_service.schemas import (
    AlertListResponse,
    AlertResponse,
)

from alert_service.service import (
    get_alert,
    list_alerts,
    mark_alert_read,
    resolve_alert,
)


router = APIRouter(
    prefix="/alerts",
    tags=["Alerts"],
)


@router.get(
    "",
    response_model=AlertListResponse,
)
def get_alerts(
    limit: int = 50,
    offset: int = 0,
    current_user=Depends(
        get_authenticated_user
    ),
    db: Session = Depends(get_db),
):
    if not 1 <= limit <= 100:
        raise HTTPException(
            status_code=422,
            detail="limit must be between 1 and 100",
        )

    if offset < 0:
        raise HTTPException(
            status_code=422,
            detail="offset cannot be negative",
        )

    items = list_alerts(
        db=db,
        user_id=current_user.id,
        limit=limit,
        offset=offset,
    )

    return AlertListResponse(
        items=items,
        total=len(items),
        limit=limit,
        offset=offset,
    )


@router.get(
    "/{alert_id}",
    response_model=AlertResponse,
)
def get_alert_by_id(
    alert_id: str,
    current_user=Depends(
        get_authenticated_user
    ),
    db: Session = Depends(get_db),
):
    alert = get_alert(
        db,
        alert_id,
        current_user.id,
    )

    if alert is None:
        raise HTTPException(
            status_code=404,
            detail="Alert not found",
        )

    return alert


@router.patch(
    "/{alert_id}/read",
    response_model=AlertResponse,
)
def read_alert(
    alert_id: str,
    current_user=Depends(
        get_authenticated_user
    ),
    db: Session = Depends(get_db),
):
    alert = get_alert(
        db,
        alert_id,
        current_user.id,
    )

    if alert is None:
        raise HTTPException(
            status_code=404,
            detail="Alert not found",
        )

    return mark_alert_read(
        db,
        alert,
    )


@router.patch(
    "/{alert_id}/resolve",
    response_model=AlertResponse,
)
def resolve(
    alert_id: str,
    current_user=Depends(
        get_authenticated_user
    ),
    db: Session = Depends(get_db),
):
    alert = get_alert(
        db,
        alert_id,
        current_user.id,
    )

    if alert is None:
        raise HTTPException(
            status_code=404,
            detail="Alert not found",
        )

    return resolve_alert(
        db,
        alert,
    )