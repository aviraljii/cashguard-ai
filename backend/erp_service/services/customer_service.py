from __future__ import annotations

from typing import Any

from erp_service.repositories.customer_repository import (
    CustomerRepository,
)
from erp_service.schemas.customer import (
    CustomerCreate,
    CustomerUpdate,
)


class CustomerService:
    """
    Business logic layer for customer operations.

    Responsibilities:
        - Validate customer business rules
        - Coordinate repository operations
        - Handle not-found cases
        - Prevent duplicate customer codes
        - Validate pagination inputs
    """

    def __init__(
        self,
        repository: CustomerRepository | None = None,
    ) -> None:
        self.repository = (
            repository
            if repository is not None
            else CustomerRepository()
        )

    def create_customer(
        self,
        payload: CustomerCreate,
    ) -> dict[str, Any]:
        """
        Create a new customer after business validation.
        """

        existing_customers = self.repository.list(
            business_id=payload.business_id,
            limit=100,
            offset=0,
        )

        for customer in existing_customers:
            if customer.get("customer_code") == payload.customer_code:
                raise ValueError(
                    "Customer code already exists for this business."
                )

        return self.repository.create(
            payload.model_dump()
        )

    def get_customer(
        self,
        customer_id: str,
    ) -> dict[str, Any]:
        """
        Get one customer by ID.
        """

        customer_id = customer_id.strip()

        if not customer_id:
            raise ValueError(
                "customer_id is required."
            )

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
        """
        Return customers with optional business/status filters.
        """

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

        if business_id is not None:
            business_id = business_id.strip()

            if not business_id:
                raise ValueError(
                    "business_id cannot be empty."
                )

        if status is not None:
            status = status.strip()

            if not status:
                raise ValueError(
                    "status cannot be empty."
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
        """
        Update an existing customer.
        """

        customer_id = customer_id.strip()

        if not customer_id:
            raise ValueError(
                "customer_id is required."
            )

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
                "No customer fields were provided for update."
            )

        # Prevent duplicate customer codes
        # within the same business.
        new_code = update_data.get(
            "customer_code"
        )

        if new_code is not None:
            new_code = new_code.strip()

            if not new_code:
                raise ValueError(
                    "customer_code cannot be empty."
                )

            existing_customers = self.repository.list(
                business_id=existing.get("business_id"),
                limit=100,
                offset=0,
            )

            for customer in existing_customers:
                if (
                    customer.get("id") != customer_id
                    and customer.get("customer_code")
                    == new_code
                ):
                    raise ValueError(
                        "Customer code already exists for this business."
                    )

            update_data["customer_code"] = new_code

        updated_customer = self.repository.update(
            customer_id,
            update_data,
        )

        if updated_customer is None:
            raise ValueError(
                f"Customer '{customer_id}' could not be updated."
            )

        return updated_customer

    def delete_customer(
        self,
        customer_id: str,
    ) -> None:
        """
        Delete an existing customer.

        Database foreign-key restrictions are intentionally
        respected. The repository/database remains responsible
        for enforcing relational integrity.
        """

        customer_id = customer_id.strip()

        if not customer_id:
            raise ValueError(
                "customer_id is required."
            )

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
                f"Customer '{customer_id}' could not be deleted."
            )