from __future__ import annotations

import os
import uuid
from decimal import Decimal
from pathlib import Path
from typing import Any

import mysql.connector
from dotenv import load_dotenv


ROOT = Path(__file__).resolve().parents[3]
load_dotenv(ROOT / ".env")


class CustomerRepository:
    """
    Data-access layer for the customers table.

    Responsibilities:
        - Create customer
        - Get customer by ID
        - List customers
        - Update customer
        - Delete customer

    Business validation belongs in the service layer.
    """

    def _get_connection(self):
        return mysql.connector.connect(
            host=os.getenv("DB_HOST", "127.0.0.1"),
            port=int(os.getenv("DB_PORT", "3406")),
            database=os.getenv(
                "DB_NAME",
                "cashguard_ai",
            ),
            user=os.getenv(
                "DB_USER",
                "root",
            ),
            password=os.getenv(
                "DB_PASSWORD",
                "",
            ),
            connection_timeout=10,
        )

    def create(
        self,
        data: dict[str, Any],
    ) -> dict[str, Any]:
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

        connection = self._get_connection()
        cursor = connection.cursor()

        try:
            cursor.execute(
                query,
                (
                    customer_id,
                    data["business_id"],
                    data["customer_code"],
                    data["name"],
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

            return self.get_by_id(
                customer_id
            )

        except Exception:
            connection.rollback()
            raise

        finally:
            cursor.close()
            connection.close()

    def get_by_id(
        self,
        customer_id: str,
    ) -> dict[str, Any] | None:

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

        connection = self._get_connection()
        cursor = connection.cursor(
            dictionary=True
        )

        try:
            cursor.execute(
                query,
                (customer_id,),
            )

            row = cursor.fetchone()

            if row is not None:
                return self._normalize_row(
                    row
                )

            return None

        finally:
            cursor.close()
            connection.close()

    def list(
        self,
        *,
        business_id: str | None = None,
        status: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict[str, Any]]:

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

        connection = self._get_connection()
        cursor = connection.cursor(
            dictionary=True
        )

        try:
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
            cursor.close()
            connection.close()

    def update(
        self,
        customer_id: str,
        data: dict[str, Any],
    ) -> dict[str, Any] | None:

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
            values.append(value)

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

        connection = self._get_connection()
        cursor = connection.cursor()

        try:
            cursor.execute(
                query,
                tuple(values),
            )

            connection.commit()

            if cursor.rowcount == 0:
                return self.get_by_id(
                    customer_id
                )

            return self.get_by_id(
                customer_id
            )

        except Exception:
            connection.rollback()
            raise

        finally:
            cursor.close()
            connection.close()

    def delete(
        self,
        customer_id: str,
    ) -> bool:

        query = """
        DELETE FROM customers
        WHERE id = %s
        """

        connection = self._get_connection()
        cursor = connection.cursor()

        try:
            cursor.execute(
                query,
                (customer_id,),
            )

            connection.commit()

            return cursor.rowcount > 0

        except Exception:
            connection.rollback()
            raise

        finally:
            cursor.close()
            connection.close()

    @staticmethod
    def _normalize_row(
        row: dict[str, Any],
    ) -> dict[str, Any]:

        result = dict(row)

        if result.get("credit_limit") is not None:
            result["credit_limit"] = str(
                result["credit_limit"]
            )

        if result.get("created_at") is not None:
            result["created_at"] = (
                result["created_at"].isoformat()
            )

        if result.get("updated_at") is not None:
            result["updated_at"] = (
                result["updated_at"].isoformat()
            )

        return result