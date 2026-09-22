"""Volunteer / responder schemas."""
from typing import Optional, List
from pydantic import BaseModel
from app.models import ResponderRole
from app.schemas.request import RequestListItem


class ResponderOut(BaseModel):
    id: int
    name: str
    role: ResponderRole
    team_id: Optional[int] = None

    class Config:
        from_attributes = True


class VolunteerTasksResponse(BaseModel):
    responder: ResponderOut
    team_id: Optional[int] = None
    tasks: List[RequestListItem]
