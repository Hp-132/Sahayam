from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.deps import get_db
from app.models import Citizen
from app.schemas.auth import CitizenSignup, CitizenSignin, AuthResponse, CitizenOut
from app.services.auth import (
    hash_password, verify_password, issue_session_token,
    get_citizen_by_token, get_citizen_by_phone_or_email,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _auth_response(citizen: Citizen) -> AuthResponse:
    return AuthResponse(
        token=citizen.session_token or "",
        citizen=CitizenOut(
            id=citizen.id,
            full_name=citizen.full_name,
            phone=citizen.phone,
            email=citizen.email,
            created_at=citizen.created_at,
        ),
    )


@router.post("/signup", response_model=AuthResponse, status_code=201)
def signup(body: CitizenSignup, db: Session = Depends(get_db)):
    existing = get_citizen_by_phone_or_email(db, body.phone)
    if existing:
        raise HTTPException(status_code=409, detail="Phone number already registered")
    if body.email:
        email_hit = db.query(Citizen).filter(Citizen.email == body.email).first()
        if email_hit:
            raise HTTPException(status_code=409, detail="Email already registered")

    token = issue_session_token()
    citizen = Citizen(
        full_name=body.full_name,
        phone=body.phone.strip(),
        email=body.email,
        password_hash=hash_password(body.password),
        session_token=token,
    )
    db.add(citizen)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Phone or email already registered")
    db.refresh(citizen)
    return _auth_response(citizen)


@router.post("/signin", response_model=AuthResponse)
def signin(body: CitizenSignin, db: Session = Depends(get_db)):
    citizen = get_citizen_by_phone_or_email(db, body.login)
    if not citizen or not verify_password(body.password, citizen.password_hash):
        raise HTTPException(status_code=401, detail="Invalid phone/email or password")
    citizen.session_token = issue_session_token()
    db.commit()
    db.refresh(citizen)
    return _auth_response(citizen)


@router.get("/me", response_model=CitizenOut)
def me(authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    token = None
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
    citizen = get_citizen_by_token(db, token)
    if not citizen:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return CitizenOut(
        id=citizen.id, full_name=citizen.full_name, phone=citizen.phone,
        email=citizen.email, created_at=citizen.created_at,
    )


@router.post("/signout")
def signout(authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    token = None
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
    citizen = get_citizen_by_token(db, token)
    if citizen:
        citizen.session_token = None
        db.commit()
    return {"status": "ok"}
