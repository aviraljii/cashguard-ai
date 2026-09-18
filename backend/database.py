from __future__ import annotations

from contextlib import contextmanager
from typing import Generator

import mysql.connector
from mysql.connector import Error
from mysql.connector.connection import MySQLConnection

from core.config import settings


def create_database_connection() -> MySQLConnection:
    """
    Create a new MySQL database connection.

    Raises:
        RuntimeError: When the database connection cannot be established.
    """
    try:
        connection = mysql.connector.connect(
            host=settings.DATABASE_HOST,
            port=settings.DATABASE_PORT,
            database=settings.DATABASE_NAME,
            user=settings.DATABASE_USER,
            password=settings.DATABASE_PASSWORD,
        )

        if not connection.is_connected():
            raise RuntimeError("Database connection could not be established.")

        return connection

    except Error as exc:
        raise RuntimeError(
            f"Failed to connect to MySQL database: {exc}"
        ) from exc


@contextmanager
def get_database_connection() -> Generator[MySQLConnection, None, None]:
    """
    Provide a database connection and guarantee cleanup.

    Usage:

        with get_database_connection() as connection:
            cursor = connection.cursor()
            ...
    """
    connection: MySQLConnection | None = None

    try:
        connection = create_database_connection()
        yield connection

    except Error as exc:
        raise RuntimeError(
            f"Database operation failed: {exc}"
        ) from exc

    finally:
        if connection is not None and connection.is_connected():
            connection.close()


def check_database_connection() -> bool:
    """
    Check whether the MySQL database is reachable.
    """
    connection: MySQLConnection | None = None

    try:
        connection = create_database_connection()
        return True

    except RuntimeError:
        return False

    finally:
        if connection is not None and connection.is_connected():
            connection.close()