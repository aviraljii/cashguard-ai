from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from auth_service.database import get_db
from auth_service.routes.auth import (
    get_authenticated_user,
)
from paisa.agent import (
    LiveBusinessContext,
    classify_intent,
    generate_paisa_answer,
    history_for_conversation,
    is_action_request,
)
from paisa.models import (
    BusinessMembership,
    PaisaConversation,
    PaisaMessage,
)


logger = logging.getLogger(
    "cashguard.paisa.routes"
)


router = APIRouter(
    prefix="/ai/paisa",
    tags=["Paisa AI"],
)


# ============================================================================
# REQUEST / RESPONSE SCHEMAS
# ============================================================================

class PaisaChatRequest(BaseModel):
    message: str = Field(
        ...,
        min_length=1,
        max_length=5000,
    )
    business_id: str | None = Field(
        default=None,
        max_length=100,
    )
    conversation_id: str | None = Field(
        default=None,
        max_length=100,
    )
    context: dict[str, Any] = Field(
        default_factory=dict,
    )
    horizon_days: int = Field(
        default=7,
        ge=1,
        le=90,
    )


class PaisaChatResponse(BaseModel):
    success: bool
    agent: str
    response: str
    model: str
    intent: str
    sources: list[str]
    conversation_id: str
    business_id: str
    needs_confirmation: bool
    generated_at: str


# ============================================================================
# BUSINESS MEMBERSHIP HELPERS
# ============================================================================

def _allowed_business_ids(
    db: Session,
    current_user: Any,
) -> set[str]:
    rows = db.scalars(
        select(
            BusinessMembership.business_id
        ).where(
            BusinessMembership.user_id
            == int(current_user.id)
        )
    ).all()

    return {
        str(value).strip()
        for value in rows
        if str(value).strip()
    }


def _is_admin_user(
    current_user: Any,
) -> bool:
    role = str(
        getattr(
            current_user,
            "role",
            "",
        )
        or ""
    ).strip().lower()

    return role in {
        "admin",
        "owner",
        "super_admin",
        "superadmin",
    }


def _business_exists(
    db: Session,
    business_id: str,
) -> bool:
    try:
        result = db.execute(
            text(
                """
                SELECT id
                FROM businesses
                WHERE id = :business_id
                LIMIT 1
                """
            ),
            {
                "business_id": business_id,
            },
        )

        return (
            result.scalar_one_or_none()
            is not None
        )

    except Exception as exc:
        logger.warning(
            "Paisa business lookup failed business_id=%s error=%s",
            business_id,
            exc,
        )
        return False


def _create_admin_business_membership(
    db: Session,
    current_user: Any,
    business_id: str,
) -> bool:
    """
    Allow an authenticated admin to bootstrap access to an existing business.

    This prevents a valid admin account from getting stuck at 409 merely
    because business_memberships has not yet been populated.
    """
    if not _is_admin_user(
        current_user
    ):
        return False

    normalized_business_id = (
        business_id or ""
    ).strip()

    if not normalized_business_id:
        return False

    if not _business_exists(
        db,
        normalized_business_id,
    ):
        return False

    existing = db.scalar(
        select(
            BusinessMembership
        ).where(
            BusinessMembership.user_id
            == int(current_user.id),
            BusinessMembership.business_id
            == normalized_business_id,
        )
    )

    if existing is not None:
        return True

    try:
        membership = BusinessMembership(
            id=str(
                uuid.uuid4()
            ),
            user_id=int(
                current_user.id
            ),
            business_id=(
                normalized_business_id
            ),
            role="owner",
            created_at=datetime.utcnow(),
        )

        db.add(
            membership
        )
        db.commit()

        logger.info(
            "Auto-created business membership "
            "user_id=%s business_id=%s role=owner",
            current_user.id,
            normalized_business_id,
        )

        return True

    except IntegrityError:
        db.rollback()

        existing = db.scalar(
            select(
                BusinessMembership
            ).where(
                BusinessMembership.user_id
                == int(current_user.id),
                BusinessMembership.business_id
                == normalized_business_id,
            )
        )

        return existing is not None

    except Exception as exc:
        db.rollback()

        logger.exception(
            "Failed to create Paisa business membership "
            "user_id=%s business_id=%s error=%s",
            current_user.id,
            normalized_business_id,
            exc,
        )

        return False


def _authorized_business_id(
    requested_business_id: str | None,
    current_user: Any,
    db: Session,
) -> str:
    allowed = _allowed_business_ids(
        db,
        current_user,
    )

    requested = (
        requested_business_id
        or ""
    ).strip()

    # Existing membership.
    if allowed:
        if (
            requested
            and requested not in allowed
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "You are not authorized "
                    "to access this business."
                ),
            )

        return (
            requested
            or sorted(allowed)[0]
        )

    # No membership yet.
    # Admin can bootstrap against an existing business.
    if requested:
        if _create_admin_business_membership(
            db=db,
            current_user=current_user,
            business_id=requested,
        ):
            return requested

        if not _business_exists(
            db,
            requested,
        ):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=(
                    "The requested CashGuard business "
                    "was not found."
                ),
            )

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "This account is authenticated but the "
                "requested business membership could not "
                "be created."
            ),
        )

    # There is no requested business.
    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail=(
            "No business is configured for this account. "
            "Provide a valid business_id."
        ),
    )


# ============================================================================
# CONVERSATION HELPERS
# ============================================================================

def _get_or_create_conversation(
    db: Session,
    conversation_id: str | None,
    user_id: int,
    business_id: str,
    title: str,
) -> PaisaConversation:
    if conversation_id:
        conversation = db.scalar(
            select(
                PaisaConversation
            ).where(
                PaisaConversation.id
                == conversation_id,
                PaisaConversation.user_id
                == user_id,
                PaisaConversation.business_id
                == business_id,
            )
        )

        if conversation is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=(
                    "Paisa conversation "
                    "was not found."
                ),
            )

        return conversation

    safe_title = (
        (title or "")
        .strip()[:255]
        or "Paisa conversation"
    )

    conversation = PaisaConversation(
        id=str(
            uuid.uuid4()
        ),
        user_id=user_id,
        business_id=business_id,
        title=safe_title,
    )

    db.add(
        conversation
    )

    db.flush()

    return conversation


# ============================================================================
# CHAT
# ============================================================================

@router.post(
    "/chat",
    response_model=PaisaChatResponse,
)
def chat(
    payload: PaisaChatRequest,
    current_user=Depends(
        get_authenticated_user
    ),
    db: Session = Depends(
        get_db
    ),
) -> PaisaChatResponse:
    business_id = _authorized_business_id(
        payload.business_id,
        current_user,
        db,
    )

    previous_intent = str(
        payload.context.get(
            "previous_intent"
        )
        or ""
    ).strip()

    intent = classify_intent(
        payload.message,
        previous_intent,
    )

    conversation = _get_or_create_conversation(
        db=db,
        conversation_id=payload.conversation_id,
        user_id=int(
            current_user.id
        ),
        business_id=business_id,
        title=payload.message[:80],
    )

    history = history_for_conversation(
        db=db,
        conversation_id=conversation.id,
        user_id=int(
            current_user.id
        ),
        business_id=business_id,
        limit=8,
    )

    try:
        context, sources = (
            LiveBusinessContext(
                db=db,
                business_id=business_id,
                user_id=int(
                    current_user.id
                ),
            ).build(
                intent=intent,
                horizon_days=payload.horizon_days,
            )
        )

        answer, model, llm_sources = (
            generate_paisa_answer(
                message=payload.message,
                context=context,
                intent=intent,
                history=history,
            )
        )

        all_sources = sorted(
            set(
                sources
                + llm_sources
            )
        )

        user_message = PaisaMessage(
            id=str(
                uuid.uuid4()
            ),
            conversation_id=conversation.id,
            user_id=int(
                current_user.id
            ),
            business_id=business_id,
            role="user",
            content=payload.message,
            intent=intent,
            model=model,
        )

        assistant_message = PaisaMessage(
            id=str(
                uuid.uuid4()
            ),
            conversation_id=conversation.id,
            user_id=int(
                current_user.id
            ),
            business_id=business_id,
            role="assistant",
            content=answer,
            intent=intent,
            model=model,
        )

        db.add_all(
            [
                user_message,
                assistant_message,
            ]
        )

        conversation.updated_at = (
            datetime.utcnow()
        )

        db.commit()

        return PaisaChatResponse(
            success=True,
            agent="paisa",
            response=answer,
            model=model,
            intent=intent,
            sources=all_sources,
            conversation_id=conversation.id,
            business_id=business_id,
            needs_confirmation=(
                is_action_request(
                    payload.message
                )
            ),
            generated_at=str(
                context.get(
                    "generated_at"
                )
            ),
        )

    except HTTPException:
        db.rollback()
        raise

    except Exception as exc:
        db.rollback()

        logger.exception(
            "Paisa chat failed: %s",
            exc,
        )

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=(
                "Paisa could not process this request "
                "from the live CashGuard workspace."
            ),
        ) from exc


# ============================================================================
# STATUS
# ============================================================================

@router.get(
    "/status"
)
def paisa_status(
    current_user=Depends(
        get_authenticated_user
    ),
    db: Session = Depends(
        get_db
    ),
) -> dict[str, Any]:
    business_id = _authorized_business_id(
        None,
        current_user,
        db,
    )

    llm_configured = bool(
        os.getenv(
            "LLM_API_KEY"
        )
        or os.getenv(
            "OLLAMA_API_KEY"
        )
    )

    return {
        "success": True,
        "agent": "paisa",
        "status": "ready",
        "mode": (
            "live_data_grounded_genai"
        ),
        "business_id": business_id,
        "llm_configured":
            llm_configured,
        "actions":
            "confirmation_required",
        "timestamp":
            datetime.utcnow()
            .isoformat()
            + "Z",
    }


# ============================================================================
# CONVERSATION LIST
# ============================================================================

@router.get(
    "/conversations"
)
def conversations(
    limit: int = 20,
    current_user=Depends(
        get_authenticated_user
    ),
    db: Session = Depends(
        get_db
    ),
) -> dict[str, Any]:
    business_id = _authorized_business_id(
        None,
        current_user,
        db,
    )

    rows = db.scalars(
        select(
            PaisaConversation
        )
        .where(
            PaisaConversation.user_id
            == int(
                current_user.id
            ),
            PaisaConversation.business_id
            == business_id,
        )
        .order_by(
            PaisaConversation.updated_at.desc()
        )
        .limit(
            max(
                1,
                min(
                    limit,
                    100,
                ),
            )
        )
    ).all()

    return {
        "success": True,
        "business_id":
            business_id,
        "conversations": [
            {
                "id":
                    row.id,
                "title":
                    row.title,
                "created_at":
                    row.created_at.isoformat(),
                "updated_at":
                    row.updated_at.isoformat(),
            }
            for row in rows
        ],
    }


# ============================================================================
# CONVERSATION DETAIL
# ============================================================================

@router.get(
    "/conversations/{conversation_id}"
)
def conversation_detail(
    conversation_id: str,
    current_user=Depends(
        get_authenticated_user
    ),
    db: Session = Depends(
        get_db
    ),
) -> dict[str, Any]:
    business_id = _authorized_business_id(
        None,
        current_user,
        db,
    )

    conversation = db.scalar(
        select(
            PaisaConversation
        ).where(
            PaisaConversation.id
            == conversation_id,
            PaisaConversation.user_id
            == int(
                current_user.id
            ),
            PaisaConversation.business_id
            == business_id,
        )
    )

    if conversation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                "Paisa conversation "
                "was not found."
            ),
        )

    rows = db.scalars(
        select(
            PaisaMessage
        )
        .where(
            PaisaMessage.conversation_id
            == conversation.id,
            PaisaMessage.user_id
            == int(
                current_user.id
            ),
            PaisaMessage.business_id
            == business_id,
        )
        .order_by(
            PaisaMessage.created_at.asc()
        )
        .limit(200)
    ).all()

    return {
        "success": True,
        "business_id":
            business_id,
        "conversation": {
            "id":
                conversation.id,
            "title":
                conversation.title,
            "messages": [
                {
                    "id":
                        row.id,
                    "role":
                        row.role,
                    "content":
                        row.content,
                    "intent":
                        row.intent,
                    "model":
                        row.model,
                    "created_at":
                        row.created_at.isoformat(),
                }
                for row in rows
            ],
        },
    }


# ============================================================================
# ACTION PREVIEW
# ============================================================================

@router.post(
    "/action"
)
def action(
    payload: dict[str, Any],
    current_user=Depends(
        get_authenticated_user
    ),
    db: Session = Depends(
        get_db
    ),
) -> dict[str, Any]:
    business_id = _authorized_business_id(
        payload.get(
            "business_id"
        ),
        current_user,
        db,
    )

    requested_action = str(
        payload.get(
            "action"
        )
        or ""
    ).strip()

    if not requested_action:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="action is required",
        )

    # Financial mutations deliberately stop at confirmation.
    # The actual payment/banking write must continue through the
    # existing protected payment service.
    return {
        "success": False,
        "agent": "paisa",
        "business_id":
            business_id,
        "action":
            requested_action,
        "needs_confirmation":
            True,
        "executed":
            False,
        "message": (
            "Paisa prepared the action, "
            "but no financial action was executed."
        ),
    }