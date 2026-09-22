"""Team schemas."""
from typing import Optional, List, Dict, Any
from pydantic import BaseModel
from app.models import TeamStatus


class TeamOut(BaseModel):
    id: int
    name: str
    type: str
    org_name: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    status: TeamStatus
    distance_meters: Optional[float] = None
    # NGO profile / workload
    services: List[str] = []
    capacity: Optional[int] = None
    active_load: int = 0
    self_registered: bool = False
    profile: Optional[Dict[str, Any]] = None

    class Config:
        from_attributes = True


class NearestTeamResponse(BaseModel):
    team_id: int
    team_name: str
    team_type: str
    organization: Optional[str] = None
    distance_meters: float
    status: TeamStatus


class AssignNearestResponse(BaseModel):
    request_id: int
    assigned_team_id: int
    team_name: str
    distance_meters: Optional[float] = None
    status: str
