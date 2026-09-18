from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from auth_service.models.user import User
from auth_service.schemas.auth import UserRegister
from auth_service.utils.password import hash_password


def get_user_by_email(
    db: Session,
    email: str,
) -> User | None:

    statement = select(User).where(
        User.email == email.lower()
    )

    return db.scalar(statement)


def get_user_by_id(
    db: Session,
    user_id: int,
) -> User | None:

    statement = select(User).where(
        User.id == user_id
    )

    return db.scalar(statement)


def create_user(
    db: Session,
    user_data: UserRegister,
) -> User:

    normalized_email = user_data.email.lower()

    existing_user = get_user_by_email(
        db,
        normalized_email,
    )

    if existing_user:
        raise ValueError(
            "Email is already registered"
        )

    user = User(
        name=user_data.name.strip(),
        email=normalized_email,
        password_hash=hash_password(
            user_data.password
        ),
        role="user",
        is_active=True,
    )

    try:
        db.add(user)
        db.commit()
        db.refresh(user)

    except IntegrityError as exc:
        db.rollback()

        raise ValueError(
            "Email is already registered"
        ) from exc

    return user