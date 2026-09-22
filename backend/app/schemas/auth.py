from typing import Optional
from datetime import datetime
from pydantic import BaseModel, Field, field_validator


class CitizenSignup(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=120)
    phone: str = Field(..., min_length=8, max_length=20)
    email: Optional[str] = Field(default=None, max_length=120)
    password: str = Field(..., min_length=6, max_length=128)

    @field_validator("phone")
    @classmethod
    def normalize_phone(cls, v: str) -> str:
        return v.strip()

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: Optional[str]) -> Optional[str]:
        if v is None or not str(v).strip():
            return None
        return str(v).strip().lower()

    @field_validator("full_name")
    @classmethod
    def normalize_name(cls, v: str) -> str:
        return v.strip()


class CitizenSignin(BaseModel):
    login: str = Field(..., min_length=1)
    password: str = Field(..., min_length=1)


class CitizenOut(BaseModel):
    id: int
    full_name: str
    phone: str
    email: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class AuthResponse(BaseModel):
    token: str
    citizen: CitizenOut
