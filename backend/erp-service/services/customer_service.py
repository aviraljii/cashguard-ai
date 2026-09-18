from __future__ import annotations

from typing import Any

from backend.erp_service.repositories.customer_repository import (
    CustomerRepository,
)
from backend.erp_service.schemas.customer import (
    CustomerCreate,
    CustomerUpdate,
)


class CustomerService:
    """
    Business logic layer for customer operations.

    Responsibilities:
        - Validate business rules
        - Coordinate repository operations
        - Handle not-found cases
        - Prevent invalid customer updates
    """

    def __init__(
        self,
        repository: CustomerRepository | None = None,
    ) -> None:
        self.repository = (
            repository
            or CustomerRepository()
        )

    def create_customer(
        self,
        payload: CustomerCreate,
    ) -> dict[str, Any]:

        existing = self.repository.list(
            business_id=payload.business_id,
            limit=100,
            offset=0,
        )

        for customer in existing:
            if (
                customer["customer_code"]
                == payload.customer_code
            ):
                raise ValueError(
                    "Customer code already exists "
                    "for this business."
                )

        return self.repository.create(
            payload.model_dump()
        )

    def get_customer(
        self,
        customer_id: str,
    ) -> dict[str, Any]:

        customer = self.repository.get_by_id(
            customer_id
        )

        if customer is None:
            raise ValueError(
                f"Customer '{customer_id}' was not found."
            )

        return customer

    def list_customers(
        self,
        *,
        business_id: str | None = None,
        status: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict[str, Any]]:

        if limit < 1:
            raise ValueError(
                "limit must be greater than 0."
            )

        if limit > 100:
            raise ValueError(
                "limit cannot exceed 100."
            )

        if offset < 0:
            raise ValueError(
                "offset cannot be negative."
            )

        return self.repository.list(
            business_id=business_id,
            status=status,
            limit=limit,
            offset=offset,
        )

    def update_customer(
        self,
        customer_id: str,
        payload: CustomerUpdate,
    ) -> dict[str, Any]:

        existing = self.repository.get_by_id(
            customer_id
        )

        if existing is None:
            raise ValueError(
                f"Customer '{customer_id}' was not found."
            )

        update_data = payload.model_dump(
            exclude_unset=True
        )

        if not update_data:
            raise ValueError(
                "No customer fields were provided "
                "for update."
            )

        new_code = update_data.get(
            "customer_code"
        )

        if new_code is not None:
            other_customers = (
                self.repository.list(
                    business_id=existing[
                        "business_id"
                    ],
                    limit=100,
                    offset=0,
                )
            )

            for customer in other_customers:
                if (
                    customer["id"] != customer_id
                    and customer["customer_code"]
                    == new_code
                ):
                    raise ValueError(
                        "Customer code already exists "
                        "for this business."
                    )

        updated = self.repository.update(
            customer_id,
            update_data,
        )

        if updated is None:
            raise ValueError(
                f"Customer '{customer_id}' "
                "could not be updated."
            )

        return updated

    def delete_customer(
        self,
        customer_id: str,
    ) -> None:

        existing = self.repository.get_by_id(
            customer_id
        )

        if existing is None:
            raise ValueError(
                f"Customer '{customer_id}' was not found."
            )

        deleted = self.repository.delete(
            customer_id
        )

        if not deleted:
            raise ValueError(
                f"Customer '{customer_id}' "
                "could not be deleted."
            )