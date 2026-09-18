from fastapi import FastAPI

from auth_service.database import Base, engine
from auth_service.models.user import User
from auth_service.routes.auth import router as auth_router


# ------------------------------------------------------------------
# REGISTER SQLALCHEMY MODELS
# ------------------------------------------------------------------

_ = User


# ------------------------------------------------------------------
# CREATE DATABASE TABLES
# ------------------------------------------------------------------

Base.metadata.create_all(
    bind=engine
)


# ------------------------------------------------------------------
# APPLICATION
# ------------------------------------------------------------------

app = FastAPI(
    title="CashGuard-AI Auth Service",
    description="Authentication service for CashGuard-AI",
    version="1.0.0",
)


# ------------------------------------------------------------------
# ROUTES
# ------------------------------------------------------------------

app.include_router(
    auth_router
)


# ------------------------------------------------------------------
# HEALTH CHECK
# ------------------------------------------------------------------

@app.get(
    "/health",
    tags=["Health"],
)
def health_check():
    return {
        "service": "auth-service",
        "status": "healthy",
    }