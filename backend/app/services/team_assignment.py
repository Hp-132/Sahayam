"""
Team assignment helpers (nearest available, assign, reassign, free team).
Assignment itself is delegated to app.services.ngo_coordination.
"""
from typing import Optional, Tuple
from sqlalchemy.orm import Session

from app.models import Request, Team
from app.services.geo import find_nearest_available_team
from app.services.ngo_coordination import offer_direct, close_request


def get_nearest_available(db: Session, request: Request) -> Optional[Tuple[Team, float]]:
    results = find_nearest_available_team(db, request.location, limit=1)
    if not results:
        return None
    return results[0]


def assign_team_to_request(
    db: Session, request: Request, team: Team, distance_meters: Optional[float] = None
) -> dict:
    """
    Assign a team (NGO) to a request:
      - creates a direct NGO offer (request_assignments row)
      - request.assigned_team_id = team.id, request.status = dispatched
      - team becomes busy once its workload reaches capacity
    The NGO then accepts or rejects from its dashboard.
    """
    offer_direct(db, request, team, distance_meters=distance_meters)
    db.refresh(request)
    db.refresh(team)

    return {
        "request_id": request.id,
        "assigned_team_id": team.id,
        "team_name": team.name,
        "distance_meters": distance_meters,
        "status": request.status.value,
    }


def free_team_if_assigned(db: Session, request: Request) -> None:
    """Close NGO assignments and recompute team availability when a request is resolved."""
    close_request(db, request)
