"""NGO registration / sign-in schemas."""
from typing import List, Optional
from pydantic import BaseModel, Field, field_validator

from app.services.ngo_coordination import SERVICE_CODES

ORG_TYPES = [
    "Registered NGO / Society",
    "Charitable Trust",
    "Section 8 Company",
    "Government / Statutory Agency",
    "Community Volunteer Group",
    "Faith-based Organisation",
]


class NgoRegister(BaseModel):
    org_name: str = Field(..., min_length=2, max_length=160)
    org_type: str
    contact_person: str = Field(..., min_length=2, max_length=120)
    phone: str = Field(..., min_length=8, max_length=20)
    email: str = Field(..., min_length=5, max_length=160)
    registration_number: Optional[str] = Field(default=None, max_length=60)
    years_experience: Optional[int] = Field(default=None, ge=0, le=150)
    operating_areas: str = Field(..., min_length=2, max_length=500)
    headquarters: str = Field(..., min_length=2, max_length=240)
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)
    services: List[str] = Field(..., min_length=1)
    team_size: int = Field(..., ge=1, le=100000)
    capacity: int = Field(..., ge=1, le=50)
    password: str = Field(..., min_length=8, max_length=128)

    @field_validator("org_name", "contact_person", "operating_areas", "headquarters", "phone")
    @classmethod
    def strip(cls, v: str) -> str:
        return v.strip()

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        v = v.strip().lower()
        if "@" not in v or "." not in v.split("@")[-1]:
            raise ValueError("Enter a valid email address")
        return v

    @field_validator("registration_number")
    @classmethod
    def blank_to_none(cls, v: Optional[str]) -> Optional[str]:
        return v.strip() if v and v.strip() else None

    @field_validator("org_type")
    @classmethod
    def valid_type(cls, v: str) -> str:
        if v not in ORG_TYPES:
            raise ValueError("Unknown organisation type")
        return v

    @field_validator("services")
    @classmethod
    def valid_services(cls, v: List[str]) -> List[str]:
        cleaned = [s.strip().lower() for s in v if s.strip()]
        bad = [s for s in cleaned if s not in SERVICE_CODES]
        if bad or not cleaned:
            raise ValueError(f"Services must be chosen from: {', '.join(SERVICE_CODES)}")
        return list(dict.fromkeys(cleaned))


class NgoSignin(BaseModel):
    login: str = Field(..., min_length=1)
    password: str = Field(..., min_length=1)


class NgoAvailability(BaseModel):
    available: bool


class NgoReject(BaseModel):
    reason: Optional[str] = Field(default=None, max_length=300)
