"""Admin dashboard schemas."""
from typing import Optional
from pydantic import BaseModel


class DashboardStats(BaseModel):
    total_requests: int
    pending_requests: int
    verified_requests: int
    dispatched_requests: int
    resolved_requests: int
    critical_requests: int
    medium_requests: int
    low_requests: int
    sms_requests: int
    app_requests: int
    average_credibility: float
    available_teams: int
    busy_teams: int
    active_disaster_zones: int


class AssignBody(BaseModel):
    team_id: int


class ReassignBody(BaseModel):
    team_id: int
