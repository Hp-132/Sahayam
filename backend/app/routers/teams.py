"""Team endpoints: list, nearest, team requests."""
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.deps import get_db
from app.models import Team, Request, TeamStatus, RequestStatus
from app.schemas.team import TeamOut, NearestTeamResponse
from app.schemas.request import RequestListItem
from app.services.geo import extract_lat_lng, find_nearest_available_team, make_point
from app.services.ngo_coordination import team_loads, team_services
from app.routers.requests import build_list_items

router = APIRouter(prefix="/api/teams", tags=["teams"])


def team_out(t: Team, active_load: int) -> TeamOut:
    lat, lng = extract_lat_lng(t.current_location)
    acc = t.account
    profile = None
    if acc:
        profile = {
            "org_type": acc.org_type,
            "contact_person": acc.contact_person,
            "phone": acc.phone,
            "email": acc.email,
            "registration_number": acc.registration_number,
            "years_experience": acc.years_experience,
            "operating_areas": acc.operating_areas,
            "headquarters": acc.headquarters,
            "team_size": acc.team_size,
            "registered_at": acc.created_at.isoformat() if acc.created_at else None,
        }
    return TeamOut(
        id=t.id, name=t.name, type=t.type, org_name=t.org_name,
        latitude=lat, longitude=lng, status=t.status,
        services=team_services(t), capacity=t.capacity, active_load=active_load,
        self_registered=bool(acc and acc.self_registered), profile=profile,
    )


@router.get("", response_model=List[TeamOut])
def list_teams(
    status: Optional[TeamStatus] = None,
    db: Session = Depends(get_db),
):
    q = db.query(Team)
    if status:
        q = q.filter(Team.status == status)
    teams = q.all()
    loads = team_loads(db, [t.id for t in teams])
    return [team_out(t, loads.get(t.id, 0)) for t in teams]


@router.get("/nearest", response_model=Optional[NearestTeamResponse])
def nearest_team(
    request_id: Optional[int] = None,
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    db: Session = Depends(get_db),
):
    """
    Find nearest AVAILABLE team.
    Supply either request_id OR lat+lng.
    """
    location = None
    if request_id is not None:
        req = db.query(Request).filter(Request.id == request_id).first()
        if not req:
            raise HTTPException(status_code=404, detail="Request not found")
        location = req.location
    elif lat is not None and lng is not None:
        location = make_point(lat, lng)
    else:
        raise HTTPException(status_code=422, detail="Provide request_id or lat+lng")

    results = find_nearest_available_team(db, location, limit=1)
    if not results:
        return None
    team, dist = results[0]
    return NearestTeamResponse(
        team_id=team.id,
        team_name=team.name,
        team_type=team.type,
        organization=team.org_name,
        distance_meters=round(dist, 1),
        status=team.status,
    )


@router.get("/{team_id}", response_model=TeamOut)
def get_team(team_id: int, db: Session = Depends(get_db)):
    t = db.query(Team).filter(Team.id == team_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Team not found")
    return team_out(t, team_loads(db, [t.id]).get(t.id, 0))


@router.get("/{team_id}/requests", response_model=List[RequestListItem])
def team_requests(team_id: int, db: Session = Depends(get_db)):
    t = db.query(Team).filter(Team.id == team_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Team not found")
    rows = (
        db.query(Request)
        .filter(Request.assigned_team_id == team_id)
        .order_by(Request.created_at.desc())
        .all()
    )
    return build_list_items(db, rows)
