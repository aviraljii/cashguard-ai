import os

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


# ------------------------------------------------------------------
# ENVIRONMENT
# ------------------------------------------------------------------

load_dotenv()


# ------------------------------------------------------------------
# DATABASE CONFIGURATION
# ------------------------------------------------------------------

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL is missing in .env"
    )


# ------------------------------------------------------------------
# SQLALCHEMY BASE
# ------------------------------------------------------------------

class Base(DeclarativeBase):
    pass


# ------------------------------------------------------------------
# DATABASE ENGINE
# ------------------------------------------------------------------

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
)


# ------------------------------------------------------------------
# DATABASE SESSION
# ------------------------------------------------------------------

SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
)


# ------------------------------------------------------------------
# DATABASE DEPENDENCY
# ------------------------------------------------------------------

def get_db():
    db = SessionLocal()

    try:
        yield db

    finally:
        db.close()
