from fastapi import FastAPI

from auth_service.models.user import User
from auth_service.routes.auth import router as auth_router
from auth_service.database import Base, engine


# Register SQLAlchemy models
_ = User

# Create tables
Base.metadata.create_all(
    bind=engine
)


app = FastAPI(
    title="CashGuard-AI Auth Service",
    description="Authentication service for CashGuard-AI",
    version="1.0.0",
)


app.include_router(
    auth_router
)


@app.get(
    "/health",
    tags=["Health"],
)
def health_check():
    return {
        "service": "auth-service",
        "status": "healthy",
    }
