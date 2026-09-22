"""Shared FastAPI dependencies."""
from typing import Optional
from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import Citizen, NgoAccount
from app.services.auth import get_citizen_by_token


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _extract_bearer(authorization: Optional[str]) -> Optional[str]:
    if not authorization:
        return None
    if authorization.lower().startswith("bearer "):
        return authorization.split(" ", 1)[1].strip()
    return None


def get_current_citizen_optional(
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> Optional[Citizen]:
    token = _extract_bearer(authorization)
    return get_citizen_by_token(db, token)


def get_current_citizen(
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> Citizen:
    token = _extract_bearer(authorization)
    citizen = get_citizen_by_token(db, token)
    if not citizen:
        raise HTTPException(status_code=401, detail="Citizen authentication required")
    return citizen


def get_current_ngo(
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> NgoAccount:
    token = _extract_bearer(authorization)
    account = db.query(NgoAccount).filter(NgoAccount.session_token == token).first() if token else None
    if not account:
        raise HTTPException(status_code=401, detail="NGO authentication required")
    return account
