"""Reusable, read-only MySQL-to-Pandas loader."""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv
import mysql.connector
import pandas as pd
from mysql.connector import Error


# Project root:
# D:\Cash-Gaurd -AI\cashguard-ai
ROOT = Path(__file__).resolve().parents[3]

# Load environment variables from project root .env
load_dotenv(ROOT / ".env")


class DatabaseLoadError(RuntimeError):
    """Raised when MySQL data cannot be read safely."""


def database_config() -> dict[str, object]:
    """Build MySQL connection configuration from environment variables."""

    required = (
        "DB_HOST",
        "DB_PORT",
        "DB_NAME",
        "DB_USER",
        "DB_PASSWORD",
    )

    missing = [name for name in required if not os.getenv(name)]

    if missing:
        raise DatabaseLoadError(
            "Missing required database environment variables: "
            + ", ".join(missing)
        )

    try:
        port = int(os.environ["DB_PORT"])
    except ValueError as error:
        raise DatabaseLoadError(
            "DB_PORT must be a valid integer."
        ) from error

    return {
        "host": os.environ["DB_HOST"],
        "port": port,
        "database": os.environ["DB_NAME"],
        "user": os.environ["DB_USER"],
        "password": os.environ["DB_PASSWORD"],
        "connection_timeout": 10,
    }


def load_query(
    query: str,
    params: tuple[object, ...] | None = None,
) -> pd.DataFrame:
    """
    Execute a read-only SELECT/CTE query and always close its connection.

    Only SELECT and WITH queries are allowed.
    INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, etc. are blocked.
    """

    # Remove SQL comment-only lines before validating the statement.
    statement = "\n".join(
        line
        for line in query.splitlines()
        if not line.lstrip().startswith("--")
    ).lstrip()

    if not statement:
        raise ValueError("SQL query cannot be empty.")

    # Read-only protection.
    if not statement.upper().startswith(("SELECT", "WITH")):
        raise ValueError(
            "Only read-only SELECT or WITH queries are permitted."
        )

    connection = None

    try:
        connection = mysql.connector.connect(**database_config())

        cursor = connection.cursor(dictionary=True)

        try:
            cursor.execute(statement, params or ())
            rows = cursor.fetchall()
            return pd.DataFrame(rows)

        finally:
            cursor.close()

    except Error as error:
        raise DatabaseLoadError(
            f"Unable to load MySQL data: {error}"
        ) from error

    finally:
        if connection is not None and connection.is_connected():
            connection.close()


def load_sql_file(path: str | Path) -> pd.DataFrame:
    """Load and execute a read-only SQL file."""

    sql_path = Path(path)

    if not sql_path.exists():
        raise FileNotFoundError(
            f"SQL file not found: {sql_path}"
        )

    query = sql_path.read_text(encoding="utf-8")

    return load_query(query)