from __future__ import annotations

import logging
from typing import Any

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    status,
)
from sqlalchemy.orm import Session

from auth_service.database import get_db
from auth_service.routes.auth import (
    get_authenticated_user,
)

from risk_service.schemas import (
    RiskResultListResponse,
    RiskResultResponse,
)

from risk_service.service import (
    calculate_payment_risk_by_id,
    get_latest_payment_risk,
    list_risk_results,
)


# ============================================================================
# LOGGING
# ============================================================================

logger = logging.getLogger(
    "cashguard.risk.routes"
)


# ============================================================================
# ROUTER
# ============================================================================

router = APIRouter(
    prefix="/risk",
    tags=["Risk Intelligence"],
)


# ============================================================================
# HELPERS
# ============================================================================


def _get_authenticated_user_id(
    current_user: Any,
) -> int:
    """
    Safely extract the authenticated user's database ID.
    """

    user_id = getattr(
        current_user,
        "id",
        None,
    )

    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authenticated user is required.",
        )

    try:
        return int(user_id)
    except (
        TypeError,
        ValueError,
    ) as exc:
        logger.error(
            "Invalid authenticated user id: %r",
            user_id,
        )

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authenticated user is invalid.",
        ) from exc


def _normalize_payment_id(
    payment_id: str,
) -> str:
    """
    Normalize and validate a payment ID.
    """

    normalized = str(
        payment_id or ""
    ).strip()

    if not normalized:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="payment_id is required.",
        )

    return normalized


# ============================================================================
# CALCULATE PAYMENT RISK
# ============================================================================


@router.post(
    "/payments/{payment_id}/analyze",
    response_model=RiskResultResponse,
    status_code=status.HTTP_200_OK,
)
def analyze_payment_risk(
    payment_id: str,
    current_user=Depends(
        get_authenticated_user
    ),
    db: Session = Depends(
        get_db
    ),
) -> RiskResultResponse:
    """
    Calculate and persist ML risk for a payment owned by
    the authenticated user.
    """

    normalized_payment_id = (
        _normalize_payment_id(
            payment_id
        )
    )

    user_id = _get_authenticated_user_id(
        current_user
    )

    try:
        result = calculate_payment_risk_by_id(
            db=db,
            payment_id=normalized_payment_id,
            user_id=user_id,
        )

    except ValueError as exc:
        logger.warning(
            "Payment risk validation failed "
            "payment_id=%s user_id=%s error=%s",
            normalized_payment_id,
            user_id,
            exc,
        )

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    except RuntimeError as exc:
        logger.exception(
            "Payment risk processing failed "
            "payment_id=%s user_id=%s",
            normalized_payment_id,
            user_id,
        )

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

    except HTTPException:
        raise

    except Exception as exc:
        logger.exception(
            "Unexpected payment risk error "
            "payment_id=%s user_id=%s",
            normalized_payment_id,
            user_id,
        )

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to calculate payment risk.",
        ) from exc

    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Payment not found.",
        )

    return result


# ============================================================================
# GET LATEST PAYMENT RISK
# ============================================================================


@router.get(
    "/payments/{payment_id}",
    response_model=RiskResultResponse,
    status_code=status.HTTP_200_OK,
)
def get_payment_risk(
    payment_id: str,
    current_user=Depends(
        get_authenticated_user
    ),
    db: Session = Depends(
        get_db
    ),
) -> RiskResultResponse:
    """
    Return the latest stored ML risk result for a payment
    owned by the authenticated user.
    """

    normalized_payment_id = (
        _normalize_payment_id(
            payment_id
        )
    )

    user_id = _get_authenticated_user_id(
        current_user
    )

    try:
        result = get_latest_payment_risk(
            db=db,
            payment_id=normalized_payment_id,
            user_id=user_id,
        )

    except ValueError as exc:
        logger.warning(
            "Payment risk lookup validation failed "
            "payment_id=%s user_id=%s error=%s",
            normalized_payment_id,
            user_id,
            exc,
        )

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    except HTTPException:
        raise

    except Exception as exc:
        logger.exception(
            "Latest payment risk lookup failed "
            "payment_id=%s user_id=%s",
            normalized_payment_id,
            user_id,
        )

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch payment risk.",
        ) from exc

    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Risk result not found.",
        )

    return result


# ============================================================================
# LIST USER RISK RESULTS
# ============================================================================


@router.get(
    "",
    response_model=RiskResultListResponse,
    status_code=status.HTTP_200_OK,
)
def get_risk_results(
    limit: int = Query(
        default=50,
        ge=1,
        le=100,
        description=(
            "Maximum number of risk results to return."
        ),
    ),
    offset: int = Query(
        default=0,
        ge=0,
        description=(
            "Number of risk results to skip."
        ),
    ),
    current_user=Depends(
        get_authenticated_user
    ),
    db: Session = Depends(
        get_db
    ),
) -> RiskResultListResponse:
    """
    Return paginated ML risk results belonging to
    the authenticated user.
    """

    user_id = _get_authenticated_user_id(
        current_user
    )

    try:
        items = list_risk_results(
            db=db,
            user_id=user_id,
            limit=limit,
            offset=offset,
        )

    except ValueError as exc:
        logger.warning(
            "Risk result listing validation failed "
            "user_id=%s error=%s",
            user_id,
            exc,
        )

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    except HTTPException:
        raise

    except Exception as exc:
        logger.exception(
            "Risk result listing failed "
            "user_id=%s",
            user_id,
        )

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch risk results.",
        ) from exc

    safe_items = (
        items
        if isinstance(
            items,
            list,
        )
        else []
    )

    return RiskResultListResponse(
        items=safe_items,
        total=len(safe_items),
        limit=limit,
        offset=offset,
    )