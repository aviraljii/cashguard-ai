from __future__ import annotations

import os

from types import SimpleNamespace
from typing import Any

from fastapi import (
    APIRouter,
    Cookie,
    Depends,
    Header,
    HTTPException,
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

from auth_service.routes.auth import (
    get_authenticated_user,
)

from auth_service.utils.jwt import (
    decode_access_token,
)

from payment_service.providers import (
    get_provider,
)

from payment_service.schemas import (
    PaymentCreate,
    PaymentResponse,
    PaymentUpdate,
    ReconciliationListResponse,
    ReconciliationResponse,
    WebhookResponse,
)

from payment_service.service import (
    create_payment,
    get_payment,
    list_payments,
    persist_webhook,
    process_webhook,
    transition_payment,
)

from payment_service.reconciliation_service import (
    list_reconciliations,
    reconcile_payment_by_id,
)


# ======================================================================
# SECURITY
# ======================================================================

security = HTTPBearer(
    auto_error=False,
)

ACCESS_COOKIE_NAME = (
    "cashguard_access_token"
)


# ======================================================================
# ROUTER
# ======================================================================

router = APIRouter(
    prefix="/payments",
    tags=["Payments"],
)


# ======================================================================
# CONSTANTS
# ======================================================================

MAX_LIMIT = 100
DEFAULT_LIMIT = 50


# ======================================================================
# DEVELOPMENT AUTH BYPASS
# ======================================================================


def payment_dev_auth_enabled() -> bool:
    """
    Development-only payment authentication bypass.

    .env:
        CASHGUARD_BANKING_DEV_BYPASS_AUTH=true

    This is intended only for local development/testing.

    Production must keep this disabled.
    """

    value = os.getenv(
        "CASHGUARD_BANKING_DEV_BYPASS_AUTH",
        "",
    )

    return (
        value.strip().lower()
        in {
            "1",
            "true",
            "yes",
            "on",
        }
    )


# ======================================================================
# PAYMENT AUTHENTICATED USER
# ======================================================================


def get_payment_authenticated_user(
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
    Authenticate payment-service requests.

    Development:
        CASHGUARD_BANKING_DEV_BYPASS_AUTH=true
        -> local user id 1 is used.

    Production:
        JWT Bearer header or HttpOnly access cookie.
    """

    # --------------------------------------------------------------
    # 1. DEVELOPMENT BYPASS
    # --------------------------------------------------------------

    if payment_dev_auth_enabled():
        print(
            "[PAYMENT AUTH] "
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
    # 2. BEARER TOKEN
    # --------------------------------------------------------------

    token: str | None = None

    if credentials is not None:
        scheme = (
            str(
                credentials.scheme or ""
            )
            .strip()
            .lower()
        )

        if scheme == "bearer":
            token = (
                str(
                    credentials.credentials or ""
                )
                .strip()
            )

    # --------------------------------------------------------------
    # 3. RAW AUTHORIZATION FALLBACK
    # --------------------------------------------------------------

    if not token:
        authorization = (
            request.headers.get(
                "Authorization"
            )
            or ""
        ).strip()

        if authorization:
            parts = authorization.split(
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

    if (
        not token
        and cashguard_access_token
    ):
        token = (
            str(
                cashguard_access_token
            )
            .strip()
        )

    # --------------------------------------------------------------
    # 5. NO TOKEN
    # --------------------------------------------------------------

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=(
                "Authentication credentials are required."
            ),
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
            detail=(
                "Token has expired. Please login again."
            ),
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
        print(
            "[PAYMENT AUTH] JWT validation error:",
            repr(exc),
        )

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

    if user_id_int <= 0:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token subject is invalid.",
            headers={
                "WWW-Authenticate": "Bearer",
            },
        )

    # --------------------------------------------------------------
    # 9. LOAD USER
    # --------------------------------------------------------------

    try:
        user = get_authenticated_user(
            credentials=credentials,
            cashguard_access_token=cashguard_access_token,
            db=db,
        )

        # Some project versions expose a dependency function
        # that resolves from request state rather than accepting
        # these values directly. In that case we use the JWT-loaded
        # user id as the authoritative fallback below.
        if user is not None:
            authenticated_id = getattr(
                user,
                "id",
                None,
            )

            if authenticated_id is not None:
                if int(authenticated_id) != user_id_int:
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail=(
                            "Authentication user mismatch."
                        ),
                        headers={
                            "WWW-Authenticate": "Bearer",
                        },
                    )

                if not getattr(
                    user,
                    "is_active",
                    True,
                ):
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="User account is inactive.",
                    )

                print(
                    "[PAYMENT AUTH] "
                    f"User authenticated successfully: "
                    f"user_id={authenticated_id}"
                )

                return user

    except HTTPException:
        raise

    except TypeError:
        # Compatibility fallback for auth dependency
        # signatures used in this project.
        pass

    # --------------------------------------------------------------
    # 10. DIRECT USER LOOKUP FALLBACK
    # --------------------------------------------------------------

    try:
        from auth_service.services.auth_service import (
            get_user_by_id,
        )

        user = get_user_by_id(
            db,
            user_id_int,
        )

    except Exception as exc:
        print(
            "[PAYMENT AUTH] User lookup error:",
            repr(exc),
        )

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authenticated user could not be loaded.",
            headers={
                "WWW-Authenticate": "Bearer",
            },
        ) from exc

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authenticated user was not found.",
            headers={
                "WWW-Authenticate": "Bearer",
            },
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive.",
        )

    print(
        "[PAYMENT AUTH] "
        f"User authenticated successfully: user_id={user.id}"
    )

    return user


# ======================================================================
# PAGINATION
# ======================================================================


def validate_pagination(
    limit: int,
    offset: int,
) -> tuple[int, int]:
    """
    Validate pagination values.
    """

    if (
        limit < 1
        or limit > MAX_LIMIT
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"limit must be between 1 and {MAX_LIMIT}."
            ),
        )

    if offset < 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "offset cannot be negative."
            ),
        )

    return limit, offset


# ======================================================================
# PROVIDER
# ======================================================================


def require_payment_provider(
    provider_name: str,
):
    """
    Return the configured payment provider.
    """

    provider = get_provider(
        provider_name
    )

    if provider is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Unsupported payment provider: "
                f"{provider_name}"
            ),
        )

    return provider


# ======================================================================
# CREATE PAYMENT
# ======================================================================


@router.post(
    "",
    response_model=PaymentResponse,
    status_code=status.HTTP_201_CREATED,
)
def create(
    payload: PaymentCreate,
    idempotency_key: str = Header(
        ...,
        alias="Idempotency-Key",
        min_length=8,
        max_length=255,
    ),
    current_user=Depends(
        get_payment_authenticated_user
    ),
    db: Session = Depends(get_db),
):
    """
    Create a payment.
    """

    cleaned_key = (
        str(
            idempotency_key or ""
        )
        .strip()
    )

    if not cleaned_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Idempotency-Key is required.",
        )

    provider_name = (
        str(
            getattr(
                payload,
                "provider",
                "",
            )
            or ""
        )
        .strip()
        .lower()
    )

    if not provider_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payment provider is required.",
        )

    provider = require_payment_provider(
        provider_name
    )

    try:
        return create_payment(
            db=db,
            user_id=current_user.id,
            payload=payload,
            idempotency_key=cleaned_key,
            provider=provider,
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc

    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

    except Exception as exc:
        print(
            "[PAYMENTS] Create payment error:",
            repr(exc),
        )

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create payment.",
        ) from exc


# ======================================================================
# LIST PAYMENTS
# ======================================================================


@router.get(
    "",
    response_model=list[PaymentResponse],
)
def list_(
    limit: int = DEFAULT_LIMIT,
    offset: int = 0,
    current_user=Depends(
        get_payment_authenticated_user
    ),
    db: Session = Depends(get_db),
):
    """
    List payments owned by the authenticated user.
    """

    limit, offset = validate_pagination(
        limit,
        offset,
    )

    try:
        return list_payments(
            db=db,
            user_id=current_user.id,
            limit=limit,
            offset=offset,
        ) or []

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    except Exception as exc:
        print(
            "[PAYMENTS] List payments error:",
            repr(exc),
        )

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to load payments.",
        ) from exc


# ======================================================================
# LIST RECONCILIATIONS
# ======================================================================


@router.get(
    "/reconciliation",
    response_model=ReconciliationListResponse,
)
def get_reconciliations(
    limit: int = DEFAULT_LIMIT,
    offset: int = 0,
    current_user=Depends(
        get_payment_authenticated_user
    ),
    db: Session = Depends(get_db),
):
    """
    List reconciliation records for the authenticated user.
    """

    limit, offset = validate_pagination(
        limit,
        offset,
    )

    try:
        items = list_reconciliations(
            db=db,
            user_id=current_user.id,
            limit=limit,
            offset=offset,
        ) or []

        return ReconciliationListResponse(
            items=items,
            total=len(items),
            limit=limit,
            offset=offset,
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    except Exception as exc:
        print(
            "[PAYMENTS] Reconciliation list error:",
            repr(exc),
        )

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to load reconciliations.",
        ) from exc


# ======================================================================
# GET PAYMENT
# ======================================================================


@router.get(
    "/{payment_id}",
    response_model=PaymentResponse,
)
def get_(
    payment_id: str,
    current_user=Depends(
        get_payment_authenticated_user
    ),
    db: Session = Depends(get_db),
):
    """
    Get one payment.
    """

    cleaned_id = (
        str(
            payment_id or ""
        )
        .strip()
    )

    if not cleaned_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="payment_id is required.",
        )

    try:
        payment = get_payment(
            db=db,
            payment_id=cleaned_id,
            user_id=current_user.id,
        )

    except Exception as exc:
        print(
            "[PAYMENTS] Payment lookup error:",
            repr(exc),
        )

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to load payment.",
        ) from exc

    if payment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Payment not found.",
        )

    return payment


# ======================================================================
# RECONCILE PAYMENT
# ======================================================================


@router.post(
    "/{payment_id}/reconcile",
    response_model=ReconciliationResponse,
)
def reconcile(
    payment_id: str,
    current_user=Depends(
        get_payment_authenticated_user
    ),
    db: Session = Depends(get_db),
):
    """
    Reconcile a payment against bank transactions.
    """

    cleaned_id = (
        str(
            payment_id or ""
        )
        .strip()
    )

    if not cleaned_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="payment_id is required.",
        )

    try:
        reconciliation = (
            reconcile_payment_by_id(
                db=db,
                payment_id=cleaned_id,
                user_id=current_user.id,
            )
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    except Exception as exc:
        print(
            "[PAYMENTS] Reconciliation error:",
            repr(exc),
        )

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to reconcile payment.",
        ) from exc

    if reconciliation is not None:
        return reconciliation

    # --------------------------------------------------------------
    # Distinguish payment-not-found from no-bank-match
    # --------------------------------------------------------------

    try:
        payment = get_payment(
            db=db,
            payment_id=cleaned_id,
            user_id=current_user.id,
        )

    except Exception as exc:
        print(
            "[PAYMENTS] Reconciliation payment lookup error:",
            repr(exc),
        )

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to verify payment.",
        ) from exc

    if payment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Payment not found.",
        )

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=(
            "No eligible bank transaction was found "
            "for reconciliation."
        ),
    )


# ======================================================================
# UPDATE PAYMENT
# ======================================================================


@router.patch(
    "/{payment_id}",
    response_model=PaymentResponse,
)
def update(
    payment_id: str,
    payload: PaymentUpdate,
    current_user=Depends(
        get_payment_authenticated_user
    ),
    db: Session = Depends(get_db),
):
    """
    Update payment state.
    """

    cleaned_id = (
        str(
            payment_id or ""
        )
        .strip()
    )

    if not cleaned_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="payment_id is required.",
        )

    try:
        payment = get_payment(
            db=db,
            payment_id=cleaned_id,
            user_id=current_user.id,
        )

    except Exception as exc:
        print(
            "[PAYMENTS] Payment lookup error:",
            repr(exc),
        )

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to load payment.",
        ) from exc

    if payment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Payment not found.",
        )

    if payload.status is None:
        return payment

    try:
        return transition_payment(
            db=db,
            payment=payment,
            new_status=payload.status,
            reason=payload.failure_reason,
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc

    except Exception as exc:
        print(
            "[PAYMENTS] Payment transition error:",
            repr(exc),
        )

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update payment.",
        ) from exc


# ======================================================================
# RETRY PAYMENT
# ======================================================================


@router.post(
    "/{payment_id}/retry",
    response_model=PaymentResponse,
)
def retry(
    payment_id: str,
    current_user=Depends(
        get_payment_authenticated_user
    ),
    db: Session = Depends(get_db),
):
    """
    Retry a failed payment.
    """

    cleaned_id = (
        str(
            payment_id or ""
        )
        .strip()
    )

    if not cleaned_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="payment_id is required.",
        )

    payment = get_payment(
        db=db,
        payment_id=cleaned_id,
        user_id=current_user.id,
    )

    if payment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Payment not found.",
        )

    try:
        return transition_payment(
            db=db,
            payment=payment,
            new_status="pending",
            reason=None,
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc

    except Exception as exc:
        print(
            "[PAYMENTS] Retry payment error:",
            repr(exc),
        )

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retry payment.",
        ) from exc


# ======================================================================
# CANCEL PAYMENT
# ======================================================================


@router.post(
    "/{payment_id}/cancel",
    response_model=PaymentResponse,
)
def cancel(
    payment_id: str,
    current_user=Depends(
        get_payment_authenticated_user
    ),
    db: Session = Depends(get_db),
):
    """
    Cancel a pending or processing payment.
    """

    cleaned_id = (
        str(
            payment_id or ""
        )
        .strip()
    )

    if not cleaned_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="payment_id is required.",
        )

    payment = get_payment(
        db=db,
        payment_id=cleaned_id,
        user_id=current_user.id,
    )

    if payment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Payment not found.",
        )

    try:
        return transition_payment(
            db=db,
            payment=payment,
            new_status="cancelled",
            reason=None,
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc

    except Exception as exc:
        print(
            "[PAYMENTS] Cancel payment error:",
            repr(exc),
        )

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to cancel payment.",
        ) from exc


# ======================================================================
# PAYMENT WEBHOOK
# ======================================================================


@router.post(
    "/webhooks/{provider}",
    response_model=WebhookResponse,
)
async def webhook(
    provider: str,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Receive and process payment-provider webhooks.

    Webhooks do not use user JWT authentication.
    They are authenticated using provider signatures.
    """

    cleaned_provider = (
        str(
            provider or ""
        )
        .strip()
        .lower()
    )

    if not cleaned_provider:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payment provider is required.",
        )

    # --------------------------------------------------------------
    # PROVIDER
    # --------------------------------------------------------------

    adapter = get_provider(
        cleaned_provider
    )

    if adapter is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Unknown payment provider.",
        )

    # --------------------------------------------------------------
    # BODY
    # --------------------------------------------------------------

    body = await request.body()

    if not body:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Webhook body is empty.",
        )

    # --------------------------------------------------------------
    # SIGNATURE
    # --------------------------------------------------------------

    signature = (
        request.headers.get(
            "X-Webhook-Signature"
        )
        or request.headers.get(
            "X-Payment-Signature"
        )
    )

    try:
        valid_signature = (
            adapter.verify_webhook(
                body,
                signature,
            )
        )

    except Exception as exc:
        print(
            "[PAYMENTS] "
            "Webhook signature verification error:",
            repr(exc),
        )

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=(
                "Unable to verify webhook signature."
            ),
        ) from exc

    if not valid_signature:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid webhook signature.",
        )

    # --------------------------------------------------------------
    # JSON
    # --------------------------------------------------------------

    try:
        payload_raw = await request.json()

    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "Webhook body must contain valid JSON."
            ),
        ) from exc

    if not isinstance(
        payload_raw,
        dict,
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "Webhook payload must be a JSON object."
            ),
        )

    payload: dict[str, Any] = payload_raw

    # --------------------------------------------------------------
    # EVENT ID
    # --------------------------------------------------------------

    event_id = (
        str(
            payload.get(
                "event_id",
                "",
            )
            or ""
        )
        .strip()
    )

    event_type = (
        str(
            payload.get(
                "event_type",
                "",
            )
            or ""
        )
        .strip()
    )

    if not event_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Webhook event_id is required.",
        )

    if not event_type:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Webhook event_type is required.",
        )

    # --------------------------------------------------------------
    # PERSIST
    # --------------------------------------------------------------

    try:
        event = persist_webhook(
            db=db,
            provider=cleaned_provider,
            event_id=event_id,
            event_type=event_type,
            payload=payload,
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    except Exception as exc:
        print(
            "[PAYMENTS] "
            "Webhook persistence error:",
            repr(exc),
        )

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=(
                "Failed to persist payment webhook."
            ),
        ) from exc

    # --------------------------------------------------------------
    # DUPLICATE
    # --------------------------------------------------------------

    if event is None:
        return WebhookResponse(
            accepted=True,
            duplicate=True,
            message="Duplicate event ignored.",
        )

    # --------------------------------------------------------------
    # PROCESS
    # --------------------------------------------------------------

    try:
        process_webhook(
            db=db,
            event=event,
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc

    except Exception as exc:
        print(
            "[PAYMENTS] "
            "Webhook processing error:",
            repr(exc),
        )

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=(
                "Failed to process payment webhook."
            ),
        ) from exc

    return WebhookResponse(
        accepted=True,
        duplicate=False,
        message="Webhook recorded successfully.",
    )