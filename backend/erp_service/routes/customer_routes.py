from __future__ import annotations

from typing import Any

from fastapi import (
    APIRouter,
    HTTPException,
    Query,
    Response,
    status,
)

from erp_service.schemas.customer import (
    CustomerCreate,
    CustomerResponse,
    CustomerUpdate,
)

from erp_service.services.customer_service import (
    CustomerService,
)


# ------------------------------------------------------------------
# ROUTER
# ------------------------------------------------------------------

router = APIRouter(
    prefix="/api/customers",
    tags=["Customers"],
)

customer_service = CustomerService()


# ------------------------------------------------------------------
# RESPONSE NORMALIZATION
# ------------------------------------------------------------------

def _to_plain_record(
    value: Any,
) -> dict[str, Any]:
    """
    Convert a customer object into a plain dictionary without changing
    unrelated fields.

    Supports:
    - Pydantic v2 models
    - Pydantic v1 models
    - dictionaries
    - ORM/object instances
    """

    if isinstance(value, dict):
        return dict(value)

    # Pydantic v2
    model_dump = getattr(
        value,
        "model_dump",
        None,
    )

    if callable(model_dump):
        try:
            dumped = model_dump()

            if isinstance(dumped, dict):
                return dumped
        except Exception:
            pass

    # Pydantic v1
    dict_method = getattr(
        value,
        "dict",
        None,
    )

    if callable(dict_method):
        try:
            dumped = dict_method()

            if isinstance(dumped, dict):
                return dumped
        except Exception:
            pass

    # Generic object fallback
    try:
        return dict(vars(value))
    except Exception:
        return {}


def _normalize_risk_segment(
    value: Any,
) -> Any:
    """
    Normalize existing DB/service risk labels into the values accepted by
    CustomerResponse.

    Current CustomerResponse contract accepts:
        low
        moderate
        high
        reliable

    Existing data may contain:
        low_risk
        medium_risk
        high_risk
    """

    if not isinstance(value, str):
        return value

    normalized = value.strip().lower()

    aliases = {
        "low_risk": "low",
        "low-risk": "low",

        "medium_risk": "moderate",
        "medium-risk": "moderate",
        "medium": "moderate",

        "high_risk": "high",
        "high-risk": "high",
    }

    return aliases.get(
        normalized,
        normalized,
    )


def _normalize_customer_record(
    value: Any,
) -> dict[str, Any]:
    """
    Normalize a single customer response before FastAPI validates it.
    """

    record = _to_plain_record(value)

    if "risk_segment" in record:
        record["risk_segment"] = (
            _normalize_risk_segment(
                record["risk_segment"],
            )
        )

    return record


def _normalize_customer_list(
    customers: Any,
) -> list[dict[str, Any]]:
    """
    Normalize a collection of customer records.
    """

    if customers is None:
        return []

    if not isinstance(
        customers,
        (list, tuple),
    ):
        customers = [customers]

    return [
        _normalize_customer_record(
            customer,
        )
        for customer in customers
    ]


def _normalize_single_customer(
    customer: Any,
) -> dict[str, Any]:
    """
    Normalize one customer record.
    """

    return _normalize_customer_record(
        customer,
    )


# ------------------------------------------------------------------
# CREATE CUSTOMER
# ------------------------------------------------------------------

@router.post(
    "",
    response_model=CustomerResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_customer(
    payload: CustomerCreate,
) -> CustomerResponse:
    """
    Create a new customer.
    """

    try:
        customer = (
            customer_service.create_customer(
                payload,
            )
        )

        return _normalize_single_customer(
            customer,
        )  # type: ignore[return-value]

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    except HTTPException:
        raise

    except Exception as exc:
        raise HTTPException(
            status_code=(
                status.HTTP_500_INTERNAL_SERVER_ERROR
            ),
            detail="Failed to create customer.",
        ) from exc


# ------------------------------------------------------------------
# LIST CUSTOMERS
# ------------------------------------------------------------------

@router.get(
    "",
    response_model=list[CustomerResponse],
)
def list_customers(
    business_id: str | None = Query(
        default=None,
        description="Filter customers by business ID.",
    ),
    status: str | None = Query(
        default=None,
        description="Filter customers by status.",
    ),
    limit: int = Query(
        default=50,
        ge=1,
        le=100,
        description=(
            "Maximum number of customers to return."
        ),
    ),
    offset: int = Query(
        default=0,
        ge=0,
        description=(
            "Number of customers to skip."
        ),
    ),
) -> list[CustomerResponse]:
    """
    List customers with optional business and status filters.

    The route keeps the API contract at max 100 records per request and
    normalizes legacy risk labels before FastAPI response validation.
    """

    try:
        customers = (
            customer_service.list_customers(
                business_id=business_id,
                status=status,
                limit=limit,
                offset=offset,
            )
        )

        normalized_customers = (
            _normalize_customer_list(
                customers,
            )
        )

        return normalized_customers  # type: ignore[return-value]

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    except HTTPException:
        raise

    except Exception as exc:
        raise HTTPException(
            status_code=(
                status.HTTP_500_INTERNAL_SERVER_ERROR
            ),
            detail="Failed to fetch customers.",
        ) from exc


# ------------------------------------------------------------------
# GET CUSTOMER
# ------------------------------------------------------------------

@router.get(
    "/{customer_id}",
    response_model=CustomerResponse,
)
def get_customer(
    customer_id: str,
) -> CustomerResponse:
    """
    Get one customer by ID.
    """

    try:
        customer = (
            customer_service.get_customer(
                customer_id,
            )
        )

        if customer is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Customer not found.",
            )

        return _normalize_single_customer(
            customer,
        )  # type: ignore[return-value]

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    except HTTPException:
        raise

    except Exception as exc:
        raise HTTPException(
            status_code=(
                status.HTTP_500_INTERNAL_SERVER_ERROR
            ),
            detail="Failed to fetch customer.",
        ) from exc


# ------------------------------------------------------------------
# UPDATE CUSTOMER
# ------------------------------------------------------------------

@router.put(
    "/{customer_id}",
    response_model=CustomerResponse,
)
def update_customer(
    customer_id: str,
    payload: CustomerUpdate,
) -> CustomerResponse:
    """
    Update an existing customer.
    """

    try:
        customer = (
            customer_service.update_customer(
                customer_id,
                payload,
            )
        )

        if customer is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Customer not found.",
            )

        return _normalize_single_customer(
            customer,
        )  # type: ignore[return-value]

    except ValueError as exc:
        message = str(exc)

        if "was not found" in message.lower():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=message,
            ) from exc

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=message,
        ) from exc

    except HTTPException:
        raise

    except Exception as exc:
        raise HTTPException(
            status_code=(
                status.HTTP_500_INTERNAL_SERVER_ERROR
            ),
            detail="Failed to update customer.",
        ) from exc


# ------------------------------------------------------------------
# DELETE CUSTOMER
# ------------------------------------------------------------------

@router.delete(
    "/{customer_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_customer(
    customer_id: str,
) -> Response:
    """
    Delete an existing customer.
    """

    try:
        customer_service.delete_customer(
            customer_id,
        )

        return Response(
            status_code=(
                status.HTTP_204_NO_CONTENT
            ),
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    except HTTPException:
        raise

    except Exception as exc:
        raise HTTPException(
            status_code=(
                status.HTTP_500_INTERNAL_SERVER_ERROR
            ),
            detail="Failed to delete customer.",
        ) from exc