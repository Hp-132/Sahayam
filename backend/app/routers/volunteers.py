"""Volunteer / responder endpoints (simulated identities, no real auth)."""
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.deps import get_db
from app.models import Responder, Request, Team
from app.schemas.volunteer import ResponderOut, VolunteerTasksResponse
from app.schemas.request import RequestListItem, to_display_status
from app.services.geo import extract_lat_lng

router = APIRouter(prefix="/api/volunteers", tags=["volunteers"])


@router.get("/{responder_id}", response_model=ResponderOut)
def get_volunteer(responder_id: int, db: Session = Depends(get_db)):
    r = db.query(Responder).filter(Responder.id == responder_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Responder not found")
    return ResponderOut(
        id=r.id, name=r.name, role=r.role, team_id=r.team_id,
    )


@router.get("/{responder_id}/tasks", response_model=VolunteerTasksResponse)
def volunteer_tasks(responder_id: int, db: Session = Depends(get_db)):
    r = db.query(Responder).filter(Responder.id == responder_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Responder not found")

    tasks = []
    if r.team_id:
        rows = (
            db.query(Request)
            .filter(Request.assigned_team_id == r.team_id)
            .order_by(Request.created_at.desc())
            .all()
        )
        for req in rows:
            lat, lng = extract_lat_lng(req.location)
            tasks.append(RequestListItem(
                id=req.id, type=req.type, severity=req.severity,
                headcount=req.headcount, status=req.status,
                display_status=to_display_status(req.status),
                credibility_score=req.credibility_score, source=req.source,
                latitude=lat, longitude=lng,
                assigned_team_id=req.assigned_team_id,
                created_at=req.created_at,
            ))

    return VolunteerTasksResponse(
        responder=ResponderOut(id=r.id, name=r.name, role=r.role, team_id=r.team_id),
        team_id=r.team_id,
        tasks=tasks,
    )
