"""Citizen password hashing and session token helpers."""
import secrets

import bcrypt
from sqlalchemy.orm import Session

from app.models import Citizen


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def issue_session_token() -> str:
    return secrets.token_urlsafe(32)


def get_citizen_by_token(db: Session, token: str | None) -> Citizen | None:
    if not token:
        return None
    return db.query(Citizen).filter(Citizen.session_token == token).first()


def get_citizen_by_phone_or_email(db: Session, login: str) -> Citizen | None:
    q = login.strip().lower()
    return (
        db.query(Citizen)
        .filter((Citizen.phone == login.strip()) | (Citizen.email == q))
        .first()
    )


def citizen_public(c: Citizen) -> dict:
    return {
        "id": c.id,
        "full_name": c.full_name,
        "phone": c.phone,
        "email": c.email,
        "created_at": c.created_at.isoformat() if c.created_at else None,
    }
