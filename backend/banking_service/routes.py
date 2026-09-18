from __future__ import annotations

import os
from types import SimpleNamespace
from typing import Any

from fastapi import (
    APIRouter,
    Cookie,
    Depends,
    HTTPException,
    Query,
    Request,
    status,
)
from fastapi.security import (
    HTTPAuthorizationCredentials,
    HTTPBearer,
)
from jwt.exceptions import (
    ExpiredSignatureError,
    InvalidTokenError,
)
from sqlalchemy.orm import Session

from auth_service.database import get_db
from auth_service.models.user import User
from auth_service.services.auth_service import get_user_by_id
from auth_service.utils.jwt import decode_access_token

from banking_service.providers import get_provider

from banking_service.schemas import (
    BankAccountCreate,
    BankAccountResponse,
    BankTransactionResponse,
    BankTransactionSummaryResponse,
    WebhookResponse,
)

from banking_service.service import (
    create_account,
    get_transaction_summary,
    list_accounts,
    list_business_transactions,
    normalize_transaction_event,
    persist_webhook_event,
)


# ==================================================================
# SECURITY
# ==================================================================

security = HTTPBearer(
    auto_error=False,
)

ACCESS_COOKIE_NAME = "cashguard_access_token"


# ==================================================================
# DEVELOPMENT AUTH FALLBACK
# ==================================================================

def banking_dev_auth_enabled() -> bool:
    """
    Development-only authentication bypass.

    .env:
        CASHGUARD_BANKING_DEV_BYPASS_AUTH=true

    NEVER enable this in production.
    """

    value = os.getenv(
        "CASHGUARD_BANKING_DEV_BYPASS_AUTH",
        "",
    )

    return value.strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


# ==================================================================
# BANKING AUTHENTICATED USER
# ==================================================================

def get_banking_authenticated_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    cashguard_access_token: str | None = Cookie(
        default=None,
        alias=ACCESS_COOKIE_NAME,
    ),
    db: Session = Depends(get_db),
):
    """
    Banking authentication.

    Development:
        CASHGUARD_BANKING_DEV_BYPASS_AUTH=true
        -> authentication is bypassed.

    Production:
        Uses Bearer JWT or HttpOnly access cookie.
    """

    # --------------------------------------------------------------
    # 1. DEVELOPMENT BYPASS
    # --------------------------------------------------------------

    if banking_dev_auth_enabled():
        print(
            "[BANKING AUTH] "
            "Development authentication bypass ENABLED."
        )

        return SimpleNamespace(
            id=1,
            email="local-dev@cashguard-ai.local",
            role="admin",
            business_id=None,
            is_active=True,
        )

    # --------------------------------------------------------------
    # 2. TOKEN FROM AUTHORIZATION HEADER
    # --------------------------------------------------------------

    token: str | None = None

    if credentials is not None:
        scheme = str(
            credentials.scheme or ""
        ).strip().lower()

        if scheme == "bearer":
            token = str(
                credentials.credentials or ""
            ).strip()

    # --------------------------------------------------------------
    # 3. RAW AUTHORIZATION FALLBACK
    # --------------------------------------------------------------

    if not token:
        raw_authorization = (
            request.headers.get(
                "Authorization"
            )
            or ""
        ).strip()

        if raw_authorization:
            parts = raw_authorization.split(
                " ",
                1,
            )

            if (
                len(parts) == 2
                and parts[0].strip().lower()
                == "bearer"
            ):
                token = parts[1].strip()

    # --------------------------------------------------------------
    # 4. COOKIE FALLBACK
    # --------------------------------------------------------------

    if not token and cashguard_access_token:
        token = str(
            cashguard_access_token
        ).strip()

    # --------------------------------------------------------------
    # 5. NO TOKEN
    # --------------------------------------------------------------

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials are required.",
            headers={
                "WWW-Authenticate": "Bearer",
            },
        )

    # --------------------------------------------------------------
    # 6. CLEAN TOKEN
    # --------------------------------------------------------------

    if token.lower().startswith(
        "bearer "
    ):
        token = token[7:].strip()

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token is empty.",
            headers={
                "WWW-Authenticate": "Bearer",
            },
        )

    # --------------------------------------------------------------
    # 7. DECODE JWT
    # --------------------------------------------------------------

    try:
        payload = decode_access_token(
            token
        )

    except ExpiredSignatureError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired. Please login again.",
            headers={
                "WWW-Authenticate": "Bearer",
            },
        ) from exc

    except InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=(
                "Invalid authentication token. "
                "Please login again."
            ),
            headers={
                "WWW-Authenticate": "Bearer",
            },
        ) from exc

    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=(
                "Unable to validate authentication token."
            ),
            headers={
                "WWW-Authenticate": "Bearer",
            },
        ) from exc

    # --------------------------------------------------------------
    # 8. USER ID
    # --------------------------------------------------------------

    user_id = payload.get(
        "sub"
    )

    if user_id is None:
        user_id = payload.get(
            "user_id"
        )

    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token subject is missing.",
            headers={
                "WWW-Authenticate": "Bearer",
            },
        )

    try:
        user_id_int = int(
            str(user_id).strip()
        )
    except (
        TypeError,
        ValueError,
    ) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token subject is invalid.",
            headers={
                "WWW-Authenticate": "Bearer",
            },
        ) from exc

    # --------------------------------------------------------------
    # 9. LOAD USER
    # --------------------------------------------------------------

    user = get_user_by_id(
        db,
        user_id_int,
    )

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authenticated user was not found.",
            headers={
                "WWW-Authenticate": "Bearer",
            },
        )

    # --------------------------------------------------------------
    # 10. ACTIVE USER
    # --------------------------------------------------------------

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive.",
        )

    print(
        "[BANKING AUTH] "
        f"User authenticated successfully: user_id={user.id}"
    )

    return user


# ==================================================================
# ROUTER
# ==================================================================

router = APIRouter(
    prefix="/banking",
    tags=["Banking"],
)


# ==================================================================
# BANK ACCOUNTS
# ==================================================================

@router.post(
    "/accounts",
    response_model=BankAccountResponse,
    status_code=status.HTTP_201_CREATED,
)
def connect_account(
    payload: BankAccountCreate,
    current_user=Depends(
        get_banking_authenticated_user
    ),
    db: Session = Depends(get_db),
) -> BankAccountResponse:

    if get_provider(
        payload.provider
    ) is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported banking provider",
        )

    try:
        return create_account(
            db=db,
            user_id=current_user.id,
            payload=payload,
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc

    except Exception as exc:
        print(
            "[BANKING] Account creation error:",
            repr(exc),
        )

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to connect banking account.",
        ) from exc


# ==================================================================
# LIST CONNECTED BANK ACCOUNTS
# ==================================================================

@router.get(
    "/accounts",
    response_model=list[BankAccountResponse],
)
def get_accounts(
    current_user=Depends(
        get_banking_authenticated_user
    ),
    db: Session = Depends(get_db),
) -> list[BankAccountResponse]:

    try:
        accounts = list_accounts(
            db=db,
            user_id=current_user.id,
        )

        return accounts or []

    except Exception as exc:
        print(
            "[BANKING] Account fetch error:",
            repr(exc),
        )

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch banking accounts.",
        ) from exc


# ==================================================================
# BANK TRANSACTIONS
# ==================================================================

@router.get(
    "/transactions",
    response_model=list[BankTransactionResponse],
)
def get_all_transactions(
    business_id: str = Query(
        ...,
        min_length=1,
        description="Business ID used to filter bank transactions.",
    ),
    limit: int = Query(
        default=50,
        ge=1,
        le=100,
    ),
    offset: int = Query(
        default=0,
        ge=0,
    ),
    current_user=Depends(
        get_banking_authenticated_user
    ),
    db: Session = Depends(get_db),
) -> list[BankTransactionResponse]:

    if current_user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
            headers={
                "WWW-Authenticate": "Bearer",
            },
        )

    cleaned_business_id = (
        business_id.strip()
    )

    if not cleaned_business_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="business_id is required.",
        )

    try:
        transactions = list_business_transactions(
            db=db,
            business_id=cleaned_business_id,
            limit=limit,
            offset=offset,
        )

        return list(
            transactions or []
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    except Exception as exc:
        print(
            "[BANKING] Transaction fetch error:",
            repr(exc),
        )

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to load banking transactions.",
        ) from exc


# ==================================================================
# TRANSACTION SUMMARY
# ==================================================================

@router.get(
    "/transactions/summary",
    response_model=BankTransactionSummaryResponse,
)
def get_banking_summary(
    business_id: str = Query(
        ...,
        min_length=1,
        description="Business ID used to calculate banking KPIs.",
    ),
    current_user=Depends(
        get_banking_authenticated_user
    ),
    db: Session = Depends(get_db),
) -> BankTransactionSummaryResponse:

    if current_user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
            headers={
                "WWW-Authenticate": "Bearer",
            },
        )

    cleaned_business_id = (
        business_id.strip()
    )

    if not cleaned_business_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="business_id is required.",
        )

    try:
        summary = get_transaction_summary(
            db=db,
            business_id=cleaned_business_id,
        )

        if not summary:
            return BankTransactionSummaryResponse(
                total_transactions=0,
                total_credit=0,
                total_debit=0,
                balance=0,
            )

        return BankTransactionSummaryResponse(
            total_transactions=summary.get(
                "total_transactions",
                0,
            ),
            total_credit=summary.get(
                "total_credit",
                0,
            ),
            total_debit=summary.get(
                "total_debit",
                0,
            ),
            balance=summary.get(
                "balance",
                0,
            ),
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    except Exception as exc:
        print(
            "[BANKING] Transaction summary error:",
            repr(exc),
        )

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to load banking summary.",
        ) from exc


# ==================================================================
# ACCOUNT-SPECIFIC TRANSACTIONS
# ==================================================================

@router.get(
    "/accounts/{account_id}/transactions",
    response_model=list[BankTransactionResponse],
)
def get_account_transactions(
    account_id: str,
    current_user=Depends(
        get_banking_authenticated_user
    ),
    db: Session = Depends(get_db),
) -> list[BankTransactionResponse]:

    _ = current_user
    _ = db
    _ = account_id

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=(
            "Account-specific transaction filtering is not supported "
            "by the current database schema. Use "
            "/api/banking/transactions?business_id=<BUSINESS_ID>."
        ),
    )


# ==================================================================
# WEBHOOKS
# ==================================================================

@router.post(
    "/webhooks/{provider}",
    response_model=WebhookResponse,
)
async def banking_webhook(
    provider: str,
    request: Request,
    db: Session = Depends(get_db),
) -> WebhookResponse:

    adapter = get_provider(
        provider
    )

    if adapter is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Unknown banking provider",
        )

    body = await request.body()

    signature = request.headers.get(
        "X-Webhook-Signature"
    )

    if not adapter.verify_webhook(
        body,
        signature,
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid webhook signature",
        )

    try:
        payload: dict[str, Any] = await request.json()

        event_id = str(
            payload["event_id"]
        ).strip()

        event_type = str(
            payload["event_type"]
        ).strip()

        if not event_id:
            raise ValueError(
                "event_id cannot be empty"
            )

        if not event_type:
            raise ValueError(
                "event_type cannot be empty"
            )

    except (
        KeyError,
        ValueError,
        TypeError,
    ) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "Webhook must contain valid "
                "event_id and event_type."
            ),
        ) from exc

    try:
        accepted = persist_webhook_event(
            db=db,
            provider=provider,
            event_id=event_id,
            event_type=event_type,
            payload=payload,
        )

    except Exception as exc:
        print(
            "[BANKING] Webhook persistence error:",
            repr(exc),
        )

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to persist webhook event.",
        ) from exc

    if not accepted:
        return WebhookResponse(
            accepted=True,
            duplicate=True,
            message="Duplicate event ignored",
        )

    try:
        normalize_transaction_event(
            db=db,
            provider=provider,
            event_type=event_type,
            payload=payload,
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc

    except Exception as exc:
        print(
            "[BANKING] Webhook normalization error:",
            repr(exc),
        )

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to process banking webhook.",
        ) from exc

    return WebhookResponse(
        accepted=True,
        duplicate=False,
        message="Webhook accepted", 
    )