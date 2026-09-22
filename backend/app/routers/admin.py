"""Admin command-center endpoints."""
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func

from app.deps import get_db
from app.models import (
    Request, Team, DisasterZone, Responder, Verification,
    RequestStatus, Severity, RequestType, RequestSource, TeamStatus, VerifierRole,
)
from app.schemas.admin import DashboardStats, AssignBody, ReassignBody
from app.schemas.request import RequestListItem, RequestOut, to_display_status
from app.routers.requests import _request_to_out, build_list_items
from app.services.team_assignment import assign_team_to_request, free_team_if_assigned
from app.services.geo import extract_lat_lng
from app.services.ngo_coordination import (
    alternatives_for, broadcast_critical, assignment_dict, candidate_dict, request_brief,
    REQUIRED_SERVICES, OPEN,
)

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/dashboard", response_model=DashboardStats)
def dashboard(db: Session = Depends(get_db)):
    total = db.query(func.count(Request.id)).scalar() or 0
    pending = db.query(func.count(Request.id)).filter(Request.status == RequestStatus.PENDING).scalar() or 0
    verified = db.query(func.count(Request.id)).filter(Request.status == RequestStatus.VERIFIED).scalar() or 0
    dispatched = db.query(func.count(Request.id)).filter(Request.status == RequestStatus.DISPATCHED).scalar() or 0
    resolved = db.query(func.count(Request.id)).filter(Request.status == RequestStatus.RESOLVED).scalar() or 0
    critical = db.query(func.count(Request.id)).filter(Request.severity == Severity.C).scalar() or 0
    medium = db.query(func.count(Request.id)).filter(Request.severity == Severity.M).scalar() or 0
    low = db.query(func.count(Request.id)).filter(Request.severity == Severity.L).scalar() or 0
    sms = db.query(func.count(Request.id)).filter(Request.source == RequestSource.SMS).scalar() or 0
    app = db.query(func.count(Request.id)).filter(Request.source == RequestSource.APP).scalar() or 0
    avg_cred = db.query(func.avg(Request.credibility_score)).scalar() or 0.0
    avail = db.query(func.count(Team.id)).filter(Team.status == TeamStatus.AVAILABLE).scalar() or 0
    busy = db.query(func.count(Team.id)).filter(Team.status == TeamStatus.BUSY).scalar() or 0
    zones = db.query(func.count(DisasterZone.id)).filter(DisasterZone.active == True).scalar() or 0

    return DashboardStats(
        total_requests=total,
        pending_requests=pending,
        verified_requests=verified,
        dispatched_requests=dispatched,
        resolved_requests=resolved,
        critical_requests=critical,
        medium_requests=medium,
        low_requests=low,
        sms_requests=sms,
        app_requests=app,
        average_credibility=round(float(avg_cred), 1),
        available_teams=avail,
        busy_teams=busy,
        active_disaster_zones=zones,
    )


@router.get("/requests", response_model=List[RequestListItem])
def admin_list_requests(
    status: Optional[RequestStatus] = None,
    severity: Optional[Severity] = None,
    type: Optional[RequestType] = None,
    source: Optional[RequestSource] = None,
    min_credibility: Optional[int] = Query(None, ge=0, le=100),
    max_credibility: Optional[int] = Query(None, ge=0, le=100),
    limit: int = Query(200, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    q = db.query(Request)
    if status:
        q = q.filter(Request.status == status)
    if severity:
        q = q.filter(Request.severity == severity)
    if type:
        q = q.filter(Request.type == type)
    if source:
        q = q.filter(Request.source == source)
    if min_credibility is not None:
        q = q.filter(Request.credibility_score >= min_credibility)
    if max_credibility is not None:
        q = q.filter(Request.credibility_score <= max_credibility)

    rows = q.order_by(Request.created_at.desc()).offset(offset).limit(limit).all()
    return build_list_items(db, rows)


@router.patch("/requests/{request_id}/verify", response_model=RequestOut)
def admin_verify(
    request_id: int,
    responder_id: int = Query(..., description="Admin responder id"),
    db: Session = Depends(get_db),
):
    req = (
        db.query(Request)
        .options(joinedload(Request.assigned_team), joinedload(Request.verifications))
        .filter(Request.id == request_id)
        .first()
    )
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    responder = db.query(Responder).filter(Responder.id == responder_id).first()
    if not responder:
        raise HTTPException(status_code=404, detail="Responder not found")

    ver = Verification(
        request_id=req.id,
        verified_by_role=VerifierRole.ADMIN,
        verified_by_id=responder_id,
    )
    db.add(ver)
    if req.status == RequestStatus.PENDING:
        req.status = RequestStatus.VERIFIED
    req.credibility_score = min(100, (req.credibility_score or 50) + 15)
    db.commit()
    db.refresh(req)
    return _request_to_out(req, db=db)


@router.patch("/requests/{request_id}/assign", response_model=RequestOut)
def admin_assign(
    request_id: int,
    body: AssignBody,
    db: Session = Depends(get_db),
):
    req = (
        db.query(Request)
        .options(joinedload(Request.assigned_team), joinedload(Request.verifications))
        .filter(Request.id == request_id)
        .first()
    )
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    team = db.query(Team).filter(Team.id == body.team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    # Allow re-assigning the same team that is already on this request (idempotent).
    # For any OTHER team it must be AVAILABLE.
    if team.id == req.assigned_team_id:
        # Already the assigned team — nothing to change; just refresh and return.
        db.refresh(req)
        return _request_to_out(req, db=db)

    if team.status != TeamStatus.AVAILABLE:
        raise HTTPException(status_code=400, detail="Team is not available")

    assign_team_to_request(db, req, team)
    db.refresh(req)
    return _request_to_out(req, db=db)


@router.patch("/requests/{request_id}/reassign", response_model=RequestOut)
def admin_reassign(
    request_id: int,
    body: ReassignBody,
    db: Session = Depends(get_db),
):
    req = (
        db.query(Request)
        .options(joinedload(Request.assigned_team), joinedload(Request.verifications))
        .filter(Request.id == request_id)
        .first()
    )
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    new_team = db.query(Team).filter(Team.id == body.team_id).first()
    if not new_team:
        raise HTTPException(status_code=404, detail="Team not found")
    if new_team.status != TeamStatus.AVAILABLE:
        raise HTTPException(status_code=400, detail="Target team is not available")

    assign_team_to_request(db, req, new_team)
    db.refresh(req)
    return _request_to_out(req, db=db)


@router.patch("/requests/{request_id}/resolve", response_model=RequestOut)
def admin_resolve(request_id: int, db: Session = Depends(get_db)):
    req = (
        db.query(Request)
        .options(joinedload(Request.assigned_team), joinedload(Request.verifications))
        .filter(Request.id == request_id)
        .first()
    )
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    req.status = RequestStatus.RESOLVED
    free_team_if_assigned(db, req)
    db.commit()
    db.refresh(req)
    return _request_to_out(req, db=db)


@router.get("/requests/{request_id}/coordination")
def admin_coordination(request_id: int, db: Session = Depends(get_db)):
    """
    NGO coordination view for one request: current assignment, full offer /
    rejection history, and the next suitable nearby NGOs (PostGIS-ranked,
    excluding NGOs that already declined or hold an open offer).
    """
    req = db.query(Request).filter(Request.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    history = [assignment_dict(a) for a in sorted(req.assignments, key=lambda a: a.created_at, reverse=True)]
    current = next(
        (h for h in history if h["team_id"] == req.assigned_team_id and h["status"] in OPEN), None
    )
    alternatives = [] if req.status == RequestStatus.RESOLVED else [candidate_dict(c) for c in alternatives_for(db, req)]
    return {
        "request": request_brief(req),
        "display_status": to_display_status(req.status, req.response_stage),
        "required_services": sorted(REQUIRED_SERVICES.get(req.type, set())),
        "is_critical": req.severity == Severity.C,
        "current_assignment": current,
        "history": history,
        "rejection_count": sum(1 for h in history if h["status"] == "rejected"),
        "broadcast_count": sum(1 for h in history if h["mode"] == "broadcast"),
        "alternatives": alternatives,
        "recommended": alternatives[0] if alternatives else None,
    }


@router.post("/requests/{request_id}/broadcast")
def admin_broadcast(request_id: int, db: Session = Depends(get_db)):
    """Forward a critical request to all suitable NGOs in the area not yet notified."""
    req = db.query(Request).filter(Request.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    offers = broadcast_critical(db, req)
    return {"request_id": req.id, "ngos_notified": len(offers), "offers": [assignment_dict(a) for a in offers]}
