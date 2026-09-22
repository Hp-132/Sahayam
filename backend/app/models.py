# SQLAlchemy ORM models: Citizen, Request, Team, Volunteer, Facility, DisasterZone,
# NgoAccount, RequestAssignment
import enum
from datetime import datetime

from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, ForeignKey, Enum as SAEnum, Text
)
from sqlalchemy.orm import relationship
from geoalchemy2 import Geography

from app.database import Base


class RequestType(str, enum.Enum):
    SAR = "SAR"
    MED = "MED"
    FIRE = "FIRE"
    MISSING = "MISSING"
    EVAC = "EVAC"
    SHELTER = "SHELTER"
    FOOD = "FOOD"
    CLOTHES = "CLOTHES"
    SUPPLIES = "SUPPLIES"
    OTHER = "OTHER"


class Severity(str, enum.Enum):
    C = "C"
    M = "M"
    L = "L"


class RequestStatus(str, enum.Enum):
    PENDING = "pending"
    VERIFIED = "verified"
    DISPATCHED = "dispatched"
    RESOLVED = "resolved"


class LocationSource(str, enum.Enum):
    GPS = "gps"
    LANDMARK = "landmark"


class RequestSource(str, enum.Enum):
    APP = "app"
    SMS = "sms"


class FacilityType(str, enum.Enum):
    HOSPITAL = "hospital"
    CLINIC = "clinic"
    SHELTER = "shelter"
    CAMP = "camp"


class TeamStatus(str, enum.Enum):
    AVAILABLE = "available"
    BUSY = "busy"
    UNAVAILABLE = "unavailable"


class ResponseStage(str, enum.Enum):
    """NGO coordination stage of a request (stored as plain string on requests.response_stage)."""
    AWAITING = "awaiting_response"   # NGO(s) dispatched, no acceptance yet
    ACCEPTED = "accepted"            # an NGO accepted
    ON_THE_WAY = "on_the_way"        # accepted NGO is travelling to the site
    REJECTED = "rejected"            # every offered NGO rejected -> admin must reassign
    COMPLETED = "completed"


class AssignmentStatus(str, enum.Enum):
    OFFERED = "offered"
    ACCEPTED = "accepted"
    ON_THE_WAY = "on_the_way"
    REJECTED = "rejected"
    WITHDRAWN = "withdrawn"          # admin reassigned elsewhere / request closed before a reply
    COMPLETED = "completed"


class AssignmentMode(str, enum.Enum):
    DIRECT = "direct"                # admin assigned one NGO
    BROADCAST = "broadcast"          # critical request forwarded to all suitable nearby NGOs


class ResponderRole(str, enum.Enum):
    VOLUNTEER = "volunteer"
    ADMIN = "admin"


class VerifierRole(str, enum.Enum):
    VOLUNTEER = "volunteer"
    ADMIN = "admin"


class Citizen(Base):
    __tablename__ = "citizens"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String, nullable=False)
    phone = Column(String, nullable=False, unique=True, index=True)
    email = Column(String, nullable=True, unique=True, index=True)
    password_hash = Column(String, nullable=False)
    session_token = Column(String, nullable=True, unique=True, index=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    requests = relationship("Request", back_populates="citizen")


class Request(Base):
    __tablename__ = "requests"

    id = Column(Integer, primary_key=True, index=True)
    track_id = Column(String, nullable=True, unique=True, index=True)
    citizen_id = Column(Integer, ForeignKey("citizens.id"), nullable=True, index=True)

    type = Column(SAEnum(RequestType), nullable=False)
    other_description = Column(Text, nullable=True)
    severity = Column(SAEnum(Severity), nullable=False)
    headcount = Column(Integer, nullable=False, default=1)

    location = Column(Geography(geometry_type="POINT", srid=4326), nullable=False)
    location_source = Column(SAEnum(LocationSource), nullable=False, default=LocationSource.GPS)
    landmark_text = Column(String, nullable=True)

    status = Column(SAEnum(RequestStatus), nullable=False, default=RequestStatus.PENDING)
    credibility_score = Column(Integer, nullable=False, default=50)
    report_count = Column(Integer, nullable=False, default=1)

    source = Column(SAEnum(RequestSource), nullable=False, default=RequestSource.APP)
    raw_sms = Column(Text, nullable=True)

    assigned_team_id = Column(Integer, ForeignKey("teams.id"), nullable=True)
    # ResponseStage value; NULL until an NGO has been dispatched
    response_stage = Column(String(24), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    verifications = relationship("Verification", back_populates="request")
    assigned_team = relationship("Team", back_populates="requests")
    citizen = relationship("Citizen", back_populates="requests")
    assignments = relationship(
        "RequestAssignment", back_populates="request", order_by="RequestAssignment.created_at"
    )


class Facility(Base):
    __tablename__ = "facilities"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    type = Column(SAEnum(FacilityType), nullable=False)
    address = Column(String, nullable=True)
    location = Column(Geography(geometry_type="POINT", srid=4326), nullable=False)
    source_osm_id = Column(String, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class Team(Base):
    __tablename__ = "teams"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    type = Column(String, nullable=False)
    org_name = Column(String, nullable=True)
    current_location = Column(Geography(geometry_type="POINT", srid=4326), nullable=False)
    status = Column(SAEnum(TeamStatus), nullable=False, default=TeamStatus.AVAILABLE)
    # Comma-separated service codes (medical,rescue,fire,evacuation,food,shelter,clothing,supplies)
    services = Column(String, nullable=True)
    # Max concurrent active requests before the organisation counts as busy
    capacity = Column(Integer, nullable=False, default=3)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    requests = relationship("Request", back_populates="assigned_team")
    members = relationship("Responder", back_populates="team")
    account = relationship("NgoAccount", back_populates="team", uselist=False)


class Responder(Base):
    __tablename__ = "responders"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    role = Column(SAEnum(ResponderRole), nullable=False)
    team_id = Column(Integer, ForeignKey("teams.id"), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    team = relationship("Team", back_populates="members")
    verifications = relationship("Verification", back_populates="verified_by")


class Verification(Base):
    __tablename__ = "verifications"

    id = Column(Integer, primary_key=True, index=True)
    request_id = Column(Integer, ForeignKey("requests.id"), nullable=False)
    verified_by_role = Column(SAEnum(VerifierRole), nullable=False)
    verified_by_id = Column(Integer, ForeignKey("responders.id"), nullable=False)

    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False)

    request = relationship("Request", back_populates="verifications")
    verified_by = relationship("Responder", back_populates="verifications")


class DisasterZone(Base):
    __tablename__ = "disaster_zones"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    boundary = Column(Geography(geometry_type="POLYGON", srid=4326), nullable=False)
    active = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class NgoAccount(Base):
    """Login + registration profile of an NGO / relief organisation (one per Team)."""
    __tablename__ = "ngo_accounts"

    id = Column(Integer, primary_key=True, index=True)
    team_id = Column(Integer, ForeignKey("teams.id"), nullable=False, unique=True)

    org_type = Column(String, nullable=False)
    contact_person = Column(String, nullable=False)
    phone = Column(String, nullable=False, unique=True, index=True)
    email = Column(String, nullable=False, unique=True, index=True)
    registration_number = Column(String, nullable=True)
    years_experience = Column(Integer, nullable=True)
    operating_areas = Column(Text, nullable=True)
    headquarters = Column(String, nullable=True)
    team_size = Column(Integer, nullable=True)

    password_hash = Column(String, nullable=False)
    session_token = Column(String, nullable=True, unique=True, index=True)
    # False for the seeded demo organisations, True for organisations that signed up
    self_registered = Column(Boolean, nullable=False, default=False)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    team = relationship("Team", back_populates="account")


class RequestAssignment(Base):
    """One NGO offer for a request, with its accept / reject outcome (full history is kept)."""
    __tablename__ = "request_assignments"

    id = Column(Integer, primary_key=True, index=True)
    request_id = Column(Integer, ForeignKey("requests.id"), nullable=False, index=True)
    team_id = Column(Integer, ForeignKey("teams.id"), nullable=False, index=True)
    mode = Column(String(16), nullable=False, default=AssignmentMode.DIRECT.value)
    status = Column(String(16), nullable=False, default=AssignmentStatus.OFFERED.value)
    distance_meters = Column(Integer, nullable=True)
    rejection_reason = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    responded_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    request = relationship("Request", back_populates="assignments")
    team = relationship("Team")
