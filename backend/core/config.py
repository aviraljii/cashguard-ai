from __future__ import annotations

import os

from dotenv import load_dotenv


# Load environment variables from .env
load_dotenv()


class Settings:
    """Application configuration loaded from environment variables."""

    APP_NAME: str = os.getenv(
        "APP_NAME",
        "CashGuard-AI API",
    )

    APP_VERSION: str = os.getenv(
        "APP_VERSION",
        "1.0.0",
    )

    DATABASE_HOST: str = os.getenv(
        "DB_HOST",
        "127.0.0.1",
    )

    DATABASE_PORT: int = int(
        os.getenv(
            "DB_PORT",
            "3406",
        )
    )

    DATABASE_NAME: str = os.getenv(
        "DB_NAME",
        "cashguard_ai",
    )

    DATABASE_USER: str = os.getenv(
        "DB_USER",
        "root",
    )

    DATABASE_PASSWORD: str = os.getenv(
        "DB_PASSWORD",
        "",
    )


settings = Settings()