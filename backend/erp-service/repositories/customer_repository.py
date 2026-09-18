from __future__ import annotations

import os
import uuid
from decimal import Decimal
from pathlib import Path
from typing import Any

import mysql.connector
from dotenv import load_dotenv
from mysql.connector import Error


# ================================================================
# PROJECT CONFIGURATION
# ================================================================

# backend/
# └── erp_service/
#     └── repositories/
#         └── customer_repository.py
#
# parents[0] = repositories
# parents[1] = erp_service
# parents[2] = backend
# parents[3] = cashguard-ai

ROOT = Path(__file__).resolve().parents[3]

load_dotenv(ROOT / ".env")


class CustomerRepository:
    """
    Database repository for Customer CRUD operations.

    Supported operations:
        - Create customer
        - Get customer by ID
        - List customers
        - Update customer
        - Delete customer

    Business validation belongs to CustomerService.
    """

    # ================================================================
    # DATABASE CONNECTION
    # ================================================================

    @staticmethod
    def _get_connection():
        """
        Create and return a MySQL database connection.
        """

        host = os.getenv(
            "DB_HOST",
            "127.0.0.1",
        )

        port_value = os.getenv(
            "DB_PORT",
            "3406",
        )

        database = os.getenv(
            "DB_NAME",
            "cashguard_ai",
        )

        user = os.getenv(
            "DB_USER",
            "root",
        )

        password = os.getenv(
            "DB_PASSWORD",
            "",
        )

        try:
            port = int(port_value)
        except (TypeError, ValueError) as exc:
            raise RuntimeError(
                f"Invalid DB_PORT value: {port_value}"
            ) from exc

        try:
            connection = mysql.connector.connect(
                host=host,
                port=port,
                database=database,
                user=user,
                password=password,
                connection_timeout=10,
                autocommit=False,
            )

            if not connection.is_connected():
                raise RuntimeError(
                    "Unable to establish MySQL connection."
                )

            return connection

        except Error as exc:
            raise RuntimeError(
                "Unable to connect to the CashGuard-AI database."
            ) from exc

    # ================================================================
    # CREATE
    # ================================================================

    def create(
        self,
        data: dict[str, Any],
    ) -> dict[str, Any]:
        """
        Create a customer.

        The supplied business_id must already exist in the
        businesses table because customers.business_id is a
        foreign key.
        """

        required_fields = (
            "business_id",
            "customer_code",
            "name",
        )

        for field in required_fields:
            value = data.get(field)

            if value is None or not str(value).strip():
                raise ValueError(
                    f"{field} is required."
                )

        customer_id = str(
            uuid.uuid4()
        )

        query = """
            INSERT INTO customers (
                id,
                business_id,
                customer_code,
                name,
                phone,
                email,
                city,
                state,
                credit_limit,
                payment_terms_days,
                risk_segment,
                status
            )
            VALUES (
                %s,
                %s,
                %s,
                %s,
                %s,
                %s,
                %s,
                %s,
                %s,
                %s,
                %s,
                %s
            )
        """

        connection = None
        cursor = None

        try:
            connection = self._get_connection()
            cursor = connection.cursor()

            cursor.execute(
                query,
                (
                    customer_id,
                    str(data["business_id"]).strip(),
                    str(data["customer_code"]).strip(),
                    str(data["name"]).strip(),
                    data.get("phone"),
                    data.get("email"),
                    data.get("city"),
                    data.get("state"),
                    data.get(
                        "credit_limit",
                        Decimal("0.00"),
                    ),
                    data.get(
                        "payment_terms_days",
                        30,
                    ),
                    data.get(
                        "risk_segment",
                        "moderate",
                    ),
                    data.get(
                        "status",
                        "active",
                    ),
                ),
            )

            connection.commit()

        except Exception:
            if connection is not None:
                try:
                    connection.rollback()
                except Exception:
                    pass

            raise

        finally:
            CustomerRepository._close_resources(
                cursor,
                connection,
            )

        created_customer = self.get_by_id(
            customer_id
        )

        if created_customer is None:
            raise RuntimeError(
                "Customer was inserted but could not be retrieved."
            )

        return created_customer

    # ================================================================
    # GET BY ID
    # ================================================================

    def get_by_id(
        self,
        customer_id: str,
    ) -> dict[str, Any] | None:
        """
        Get one customer by ID.
        """

        customer_id = str(
            customer_id
        ).strip()

        if not customer_id:
            raise ValueError(
                "customer_id is required."
            )

        query = """
            SELECT
                id,
                business_id,
                customer_code,
                name,
                phone,
                email,
                city,
                state,
                credit_limit,
                payment_terms_days,
                risk_segment,
                status,
                created_at,
                updated_at
            FROM customers
            WHERE id = %s
            LIMIT 1
        """

        connection = None
        cursor = None

        try:
            connection = self._get_connection()

            cursor = connection.cursor(
                dictionary=True
            )

            cursor.execute(
                query,
                (customer_id,),
            )

            row = cursor.fetchone()

            if row is None:
                return None

            return self._normalize_row(
                row
            )

        finally:
            CustomerRepository._close_resources(
                cursor,
                connection,
            )

    # ================================================================
    # LIST
    # ================================================================

    def list(
        self,
        *,
        business_id: str | None = None,
        status: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """
        List customers with optional filters.
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

        conditions: list[str] = []
        parameters: list[Any] = []

        if business_id is not None:
            conditions.append(
                "business_id = %s"
            )
            parameters.append(
                business_id
            )

        if status is not None:
            conditions.append(
                "status = %s"
            )
            parameters.append(
                status
            )

        where_clause = ""

        if conditions:
            where_clause = (
                "WHERE "
                + " AND ".join(
                    conditions
                )
            )

        query = f"""
            SELECT
                id,
                business_id,
                customer_code,
                name,
                phone,
                email,
                city,
                state,
                credit_limit,
                payment_terms_days,
                risk_segment,
                status,
                created_at,
                updated_at
            FROM customers
            {where_clause}
            ORDER BY created_at DESC
            LIMIT %s OFFSET %s
        """

        parameters.extend(
            [
                limit,
                offset,
            ]
        )

        connection = None
        cursor = None

        try:
            connection = self._get_connection()

            cursor = connection.cursor(
                dictionary=True
            )

            cursor.execute(
                query,
                tuple(parameters),
            )

            rows = cursor.fetchall()

            return [
                self._normalize_row(row)
                for row in rows
            ]

        finally:
            CustomerRepository._close_resources(
                cursor,
                connection,
            )

    # ================================================================
    # UPDATE
    # ================================================================

    def update(
        self,
        customer_id: str,
        data: dict[str, Any],
    ) -> dict[str, Any] | None:
        """
        Update an existing customer.

        business_id is intentionally not updateable here because
        changing the parent business relationship should be handled
        separately and explicitly.
        """

        customer_id = str(
            customer_id
        ).strip()

        if not customer_id:
            raise ValueError(
                "customer_id is required."
            )

        if not data:
            return self.get_by_id(
                customer_id
            )

        allowed_fields = {
            "customer_code",
            "name",
            "phone",
            "email",
            "city",
            "state",
            "credit_limit",
            "payment_terms_days",
            "risk_segment",
            "status",
        }

        update_fields: list[str] = []
        values: list[Any] = []

        for field, value in data.items():

            if field not in allowed_fields:
                continue

            update_fields.append(
                f"{field} = %s"
            )

            values.append(
                value
            )

        if not update_fields:
            return self.get_by_id(
                customer_id
            )

        query = f"""
            UPDATE customers
            SET {", ".join(update_fields)}
            WHERE id = %s
        """

        values.append(
            customer_id
        )

        connection = None
        cursor = None

        try:
            connection = self._get_connection()

            cursor = connection.cursor()

            cursor.execute(
                query,
                tuple(values),
            )

            connection.commit()

        except Exception:
            if connection is not None:
                try:
                    connection.rollback()
                except Exception:
                    pass

            raise

        finally:
            CustomerRepository._close_resources(
                cursor,
                connection,
            )

        return self.get_by_id(
            customer_id
        )

    # ================================================================
    # DELETE
    # ================================================================

    def delete(
        self,
        customer_id: str,
    ) -> bool:
        """
        Delete a customer by ID.

        Returns:
            True  -> deleted
            False -> customer did not exist
        """

        customer_id = str(
            customer_id
        ).strip()

        if not customer_id:
            raise ValueError(
                "customer_id is required."
            )

        query = """
            DELETE FROM customers
            WHERE id = %s
        """

        connection = None
        cursor = None

        try:
            connection = self._get_connection()

            cursor = connection.cursor()

            cursor.execute(
                query,
                (customer_id,),
            )

            deleted = (
                cursor.rowcount > 0
            )

            connection.commit()

            return deleted

        except Exception:
            if connection is not None:
                try:
                    connection.rollback()
                except Exception:
                    pass

            raise

        finally:
            CustomerRepository._close_resources(
                cursor,
                connection,
            )

    # ================================================================
    # NORMALIZATION
    # ================================================================

    @staticmethod
    def _normalize_row(
        row: dict[str, Any],
    ) -> dict[str, Any]:
        """
        Convert MySQL-specific values into JSON-safe values.
        """

        result = dict(row)

        credit_limit = result.get(
            "credit_limit"
        )

        if credit_limit is not None:

            if isinstance(
                credit_limit,
                Decimal,
            ):
                result["credit_limit"] = float(
                    credit_limit
                )
            else:
                try:
                    result["credit_limit"] = float(
                        credit_limit
                    )
                except (
                    TypeError,
                    ValueError,
                ):
                    result["credit_limit"] = 0.0

        for field in (
            "created_at",
            "updated_at",
        ):
            value = result.get(
                field
            )

            if value is not None and hasattr(
                value,
                "isoformat",
            ):
                result[field] = value.isoformat()

        return result

    # ================================================================
    # RESOURCE CLEANUP
    # ================================================================

    @staticmethod
    def _close_resources(
        cursor: Any,
        connection: Any,
    ) -> None:
        """
        Safely close cursor and connection.
        """

        if cursor is not None:
            try:
                cursor.close()
            except Exception:
                pass

        if connection is not None:
            try:
                connection.close()
            except Exception:
                pass
