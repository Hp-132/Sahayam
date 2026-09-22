"""Request-related Pydantic schemas."""
from datetime import datetime
from typing import Optional, List, Any, Dict
from pydantic import BaseModel, Field, field_validator

from app.models import (
    RequestType, Severity, RequestStatus, LocationSource, RequestSource, VerifierRole
)


class RequestCreate(BaseModel):
    type: RequestType
    other_description: Optional[str] = None
    # Ignored: priority is always derived from `type` on the backend (app.services.priority)
    severity: Optional[Severity] = None
    headcount: int = Field(default=1, ge=1, le=200)
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)
    # Accept both naming styles
    lat: Optional[float] = Field(default=None, ge=-90, le=90)
    lng: Optional[float] = Field(default=None, ge=-180, le=180)
    location_source: LocationSource = LocationSource.GPS
    landmark_text: Optional[str] = None
    source: RequestSource = RequestSource.APP

    def resolved_lat(self) -> Optional[float]:
        return self.latitude if self.latitude is not None else self.lat

    def resolved_lng(self) -> Optional[float]:
        return self.longitude if self.longitude is not None else self.lng


class TeamBrief(BaseModel):
    id: int
    name: str
    type: str
    org_name: Optional[str] = None
    status: Optional[str] = None

    class Config:
        from_attributes = True


class VerificationBrief(BaseModel):
    id: int
    verified_by_role: VerifierRole
    verified_by_id: int
    timestamp: datetime

    class Config:
        from_attributes = True


class RequestOut(BaseModel):
    id: int
    track_id: Optional[str] = None
    citizen_id: Optional[int] = None
    type: RequestType
    other_description: Optional[str] = None
    severity: Severity
    headcount: int
    status: RequestStatus
    display_status: str
    credibility_score: int
    report_count: int
    location_source: LocationSource
    landmark_text: Optional[str] = None
    source: RequestSource
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    assigned_team_id: Optional[int] = None
    assigned_team: Optional[TeamBrief] = None
    distance_from_request_meters: Optional[float] = None
    # NGO coordination
    response_stage: Optional[str] = None
    notified_ngo_count: int = 0
    responding_teams: List[TeamBrief] = []
    verifications: List[VerificationBrief] = []
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class RequestListItem(BaseModel):
    id: int
    track_id: Optional[str] = None
    citizen_id: Optional[int] = None
    type: RequestType
    severity: Severity
    headcount: int
    status: RequestStatus
    display_status: str
    credibility_score: int
    source: RequestSource
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    assigned_team_id: Optional[int] = None
    # NGO coordination
    assigned_team: Optional[TeamBrief] = None
    response_stage: Optional[str] = None
    rejection_count: int = 0
    open_offer_count: int = 0
    created_at: datetime

    class Config:
        from_attributes = True


class DuplicateResult(BaseModel):
    is_duplicate: bool
    matched_request_id: Optional[int] = None
    similarity: Optional[float] = None
    distance_meters: Optional[float] = None


class RequestCreateResponse(BaseModel):
    id: int
    track_id: str
    type: RequestType
    severity: Severity
    headcount: int
    status: RequestStatus
    credibility_score: int
    location_source: LocationSource
    source: RequestSource
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    created_at: datetime
    duplicate_info: Optional[DuplicateResult] = None
    credibility_meta: Optional[Dict[str, Any]] = None
    ngos_notified: int = 0


class LocationContext(BaseModel):
    inside_disaster_zone: bool
    zone_name: Optional[str] = None
    nearby_facilities: List[Dict[str, Any]] = []
    nearest_team: Optional[Dict[str, Any]] = None


# Status → frontend display mapping
DISPLAY_STATUS = {
    "pending": "Pending",
    "verified": "Verified",
    "dispatched": "NGO Dispatched",
    "resolved": "Resolved",
}

# While dispatched, the NGO response stage is more precise than the status
DISPLAY_STAGE = {
    "awaiting_response": "NGO Dispatched",
    "accepted": "NGO Accepted",
    "on_the_way": "NGO On the Way",
    "rejected": "Reassignment Needed",
}


def to_display_status(status: RequestStatus, response_stage: Optional[str] = None) -> str:
    value = status.value if hasattr(status, "value") else str(status)
    if value != "resolved" and response_stage in DISPLAY_STAGE:
        return DISPLAY_STAGE[response_stage]
    return DISPLAY_STATUS.get(value, str(status))
