"""
Request management: create, list, get, duplicates, assign, verify, resolve, acknowledge.
"""
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload
from geoalchemy2.functions import ST_Distance

from app.deps import get_db, get_current_citizen_optional, get_current_citizen
from app.models import (
    Request, Team, Verification, Responder, Citizen, RequestAssignment,
    RequestType, Severity, RequestStatus, LocationSource, RequestSource, VerifierRole,
    AssignmentStatus,
)
from app.schemas.request import (
    RequestCreate, RequestOut, RequestListItem, RequestCreateResponse,
    DuplicateResult, LocationContext, to_display_status, TeamBrief, VerificationBrief,
)
from app.schemas.team import AssignNearestResponse, NearestTeamResponse
from app.services.geo import make_point, extract_lat_lng, is_inside_active_zone, facilities_within_radius, find_nearest_available_team
from app.services.duplicate_detector import find_duplicates, check_request_duplicates
from app.services.credibility import calculate_credibility
from app.services.geocoding import geocode_landmark
from app.services.team_assignment import get_nearest_available, assign_team_to_request, free_team_if_assigned
from app.services.track_id import generate_track_id
from app.services.priority import priority_for_type, priority_map
from app.services.ngo_coordination import broadcast_critical, COMMITTED
from app.config import DEFAULT_NEARBY_RADIUS_METERS

router = APIRouter(prefix="/api/requests", tags=["requests"])


def _team_brief(t: Team) -> TeamBrief:
    return TeamBrief(
        id=t.id, name=t.name, type=t.type,
        org_name=t.org_name, status=t.status.value if t.status else None,
    )


def build_list_items(db: Session, rows: List[Request]) -> List[RequestListItem]:
    """RequestListItem rows incl. assigned NGO and rejection / open-offer counts (2 extra queries)."""
    ids = [r.id for r in rows]
    counts: dict = {}
    if ids:
        q = (
            db.query(RequestAssignment.request_id, RequestAssignment.status, func.count(RequestAssignment.id))
            .filter(RequestAssignment.request_id.in_(ids))
            .group_by(RequestAssignment.request_id, RequestAssignment.status)
        )
        for rid, st, n in q.all():
            counts.setdefault(rid, {})[st] = int(n)
    team_ids = {r.assigned_team_id for r in rows if r.assigned_team_id}
    teams = {t.id: t for t in db.query(Team).filter(Team.id.in_(team_ids)).all()} if team_ids else {}

    out = []
    for r in rows:
        lat, lng = extract_lat_lng(r.location)
        c = counts.get(r.id, {})
        t = teams.get(r.assigned_team_id)
        out.append(RequestListItem(
            id=r.id, track_id=r.track_id, citizen_id=r.citizen_id,
            type=r.type, severity=r.severity, headcount=r.headcount,
            status=r.status, display_status=to_display_status(r.status, r.response_stage),
            credibility_score=r.credibility_score, source=r.source,
            latitude=lat, longitude=lng, assigned_team_id=r.assigned_team_id,
            assigned_team=_team_brief(t) if t else None,
            response_stage=r.response_stage,
            rejection_count=c.get(AssignmentStatus.REJECTED.value, 0),
            open_offer_count=c.get(AssignmentStatus.OFFERED.value, 0),
            created_at=r.created_at,
        ))
    return out


@router.get("/priority-map")
def get_priority_map():
    """Backend-owned request type -> priority mapping (C/M/L). Citizens cannot choose priority."""
    return priority_map()


def _request_to_out(req: Request, db: Session = None, include_distance: bool = False) -> RequestOut:
    lat, lng = extract_lat_lng(req.location)
    team_brief = None
    dist = None
    if req.assigned_team:
        t = req.assigned_team
        team_brief = _team_brief(t)
        if include_distance and db is not None and req.location is not None and t.current_location is not None:
            try:
                d = db.query(ST_Distance(req.location, t.current_location)).scalar()
                dist = round(float(d), 1) if d is not None else None
            except Exception:
                pass

    verifs = [
        VerificationBrief(
            id=v.id,
            verified_by_role=v.verified_by_role,
            verified_by_id=v.verified_by_id,
            timestamp=v.timestamp,
        )
        for v in (req.verifications or [])
    ]

    return RequestOut(
        id=req.id,
        track_id=req.track_id,
        citizen_id=req.citizen_id,
        type=req.type,
        other_description=req.other_description,
        severity=req.severity,
        headcount=req.headcount,
        status=req.status,
        display_status=to_display_status(req.status, req.response_stage),
        credibility_score=req.credibility_score,
        report_count=req.report_count,
        location_source=req.location_source,
        landmark_text=req.landmark_text,
        source=req.source,
        latitude=lat,
        longitude=lng,
        assigned_team_id=req.assigned_team_id,
        assigned_team=team_brief,
        distance_from_request_meters=dist,
        response_stage=req.response_stage,
        notified_ngo_count=len({a.team_id for a in (req.assignments or [])}),
        responding_teams=[
            _team_brief(a.team) for a in (req.assignments or [])
            if a.status in COMMITTED or a.status == AssignmentStatus.COMPLETED.value
        ],
        verifications=verifs,
        created_at=req.created_at,
        updated_at=req.updated_at,
    )


@router.post("", response_model=RequestCreateResponse, status_code=201)
def create_request(
    body: RequestCreate,
    db: Session = Depends(get_db),
    citizen: Optional[Citizen] = Depends(get_current_citizen_optional),
):
    """
    Citizen creates a new emergency request (authenticated preferred).
    Generates unique Track ID (SAY-YYYY-XXXXXX).
    """
    lat = body.resolved_lat()
    lng = body.resolved_lng()
    location_source = body.location_source
    landmark_text = body.landmark_text

    # Landmark path: try geocoding
    if location_source == LocationSource.LANDMARK or (lat is None and landmark_text):
        location_source = LocationSource.LANDMARK
        if not landmark_text:
            raise HTTPException(status_code=422, detail="landmark_text required when location_source=landmark")
        geo = geocode_landmark(landmark_text)
        if geo:
            lat, lng = geo["latitude"], geo["longitude"]
        else:
            # Store with a safe fallback point near Surat demo area if geocoding fails
            # so the request is not lost; frontend can still track by id.
            lat = lat or 21.1702
            lng = lng or 72.8311

    if lat is None or lng is None:
        raise HTTPException(status_code=422, detail="latitude/longitude required (or resolvable landmark)")

    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        raise HTTPException(status_code=422, detail="Invalid coordinates")

    location = make_point(lat, lng)

    # Priority is decided by the backend from the request type, never by the client
    severity = priority_for_type(body.type)

    # Duplicate detection
    dup = find_duplicates(
        db,
        lat=lat,
        lng=lng,
        location=location,
        type_value=body.type.value,
        severity_value=severity.value,
        headcount=body.headcount,
        other_description=body.other_description,
        landmark_text=landmark_text,
    )
    is_dup = bool(dup and dup.get("is_duplicate"))

    # If clear duplicate, optionally bump report_count on the matched request
    if is_dup and dup.get("matched_request_id"):
        matched = db.query(Request).filter(Request.id == dup["matched_request_id"]).first()
        if matched:
            matched.report_count = (matched.report_count or 1) + 1
            # Recalculate credibility for the matched one
            cred_matched = calculate_credibility(
                db,
                location=matched.location,
                location_source=matched.location_source,
                is_duplicate=False,
                corroboration_count=max(0, matched.report_count - 1),
            )
            matched.credibility_score = cred_matched["score"]
            db.commit()

    # Credibility for the new request
    cred = calculate_credibility(
        db,
        location=location,
        location_source=location_source,
        is_duplicate=is_dup,
        corroboration_count=0,
    )

    track_id = generate_track_id(db)

    req = Request(
        track_id=track_id,
        citizen_id=citizen.id if citizen else None,
        type=body.type,
        other_description=body.other_description,
        severity=severity,
        headcount=body.headcount,
        location=location,
        location_source=location_source,
        landmark_text=landmark_text,
        status=RequestStatus.PENDING,
        credibility_score=cred["score"],
        report_count=1,
        source=body.source,
    )
    db.add(req)
    db.commit()
    db.refresh(req)

    # Critical requests go straight to every suitable NGO nearby (duplicates are
    # already covered by the request they duplicate)
    ngos_notified = 0
    if severity == Severity.C and not is_dup:
        ngos_notified = len(broadcast_critical(db, req))
        db.refresh(req)

    return RequestCreateResponse(
        id=req.id,
        track_id=req.track_id,
        type=req.type,
        severity=req.severity,
        headcount=req.headcount,
        status=req.status,
        credibility_score=req.credibility_score,
        location_source=req.location_source,
        source=req.source,
        latitude=lat,
        longitude=lng,
        created_at=req.created_at,
        duplicate_info=DuplicateResult(**dup) if dup else DuplicateResult(is_duplicate=False),
        credibility_meta=cred,
        ngos_notified=ngos_notified,
    )


@router.get("", response_model=List[RequestListItem])
def list_requests(
    status: Optional[RequestStatus] = None,
    severity: Optional[Severity] = None,
    type: Optional[RequestType] = None,
    source: Optional[RequestSource] = None,
    min_credibility: Optional[int] = Query(None, ge=0, le=100),
    max_credibility: Optional[int] = Query(None, ge=0, le=100),
    limit: int = Query(100, ge=1, le=500),
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


@router.get("/mine", response_model=List[RequestListItem])
def list_my_requests(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    citizen: Citizen = Depends(get_current_citizen),
):
    """Citizen-only: list requests owned by the authenticated citizen."""
    rows = (
        db.query(Request)
        .filter(Request.citizen_id == citizen.id)
        .order_by(Request.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return build_list_items(db, rows)


@router.get("/by-track/{track_id}", response_model=RequestOut)
def get_request_by_track(
    track_id: str,
    db: Session = Depends(get_db),
    citizen: Optional[Citizen] = Depends(get_current_citizen_optional),
):
    req = (
        db.query(Request)
        .options(joinedload(Request.assigned_team), joinedload(Request.verifications))
        .filter(Request.track_id == track_id.strip())
        .first()
    )
    if not req:
        req = (
            db.query(Request)
            .options(joinedload(Request.assigned_team), joinedload(Request.verifications))
            .filter(Request.track_id == track_id.strip().upper())
            .first()
        )
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.citizen_id is not None and citizen is not None and req.citizen_id != citizen.id:
        raise HTTPException(status_code=403, detail="Not authorized to view this request")
    if req.citizen_id is not None and citizen is None:
        raise HTTPException(status_code=401, detail="Sign in to view this request")
    return _request_to_out(req, db=db, include_distance=True)


@router.get("/{request_id}", response_model=RequestOut)
def get_request(
    request_id: int,
    db: Session = Depends(get_db),
    citizen: Optional[Citizen] = Depends(get_current_citizen_optional),
):
    """Citizen tracking endpoint — ownership enforced when request has a citizen owner."""
    req = (
        db.query(Request)
        .options(joinedload(Request.assigned_team), joinedload(Request.verifications))
        .filter(Request.id == request_id)
        .first()
    )
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.citizen_id is not None and citizen is not None and req.citizen_id != citizen.id:
        raise HTTPException(status_code=403, detail="Not authorized to view this request")
    if req.citizen_id is not None and citizen is None:
        raise HTTPException(status_code=401, detail="Sign in to view this request")
    return _request_to_out(req, db=db, include_distance=True)


@router.get("/{request_id}/duplicates", response_model=DuplicateResult)
def get_duplicates(request_id: int, db: Session = Depends(get_db)):
    req = db.query(Request).filter(Request.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    result = check_request_duplicates(db, request_id)
    if not result:
        return DuplicateResult(is_duplicate=False)
    return DuplicateResult(**result)


@router.get("/{request_id}/location-context", response_model=LocationContext)
def location_context(request_id: int, db: Session = Depends(get_db)):
    req = db.query(Request).filter(Request.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    inside, zone_name = is_inside_active_zone(db, req.location)
    lat, lng = extract_lat_lng(req.location)

    nearby = []
    if lat is not None and lng is not None:
        facs = facilities_within_radius(db, lat, lng, DEFAULT_NEARBY_RADIUS_METERS)
        for f, dist in facs[:10]:
            nearby.append({
                "id": f.id, "name": f.name, "type": f.type.value,
                "address": f.address, "distance_meters": round(dist, 1),
            })

    nearest_team = None
    nt = find_nearest_available_team(db, req.location, limit=1)
    if nt:
        t, d = nt[0]
        nearest_team = {
            "id": t.id, "name": t.name, "type": t.type,
            "org_name": t.org_name, "distance_meters": round(d, 1),
            "status": t.status.value,
        }

    return LocationContext(
        inside_disaster_zone=inside,
        zone_name=zone_name,
        nearby_facilities=nearby,
        nearest_team=nearest_team,
    )


@router.get("/{request_id}/nearest-team", response_model=Optional[NearestTeamResponse])
def nearest_team_for_request(request_id: int, db: Session = Depends(get_db)):
    req = db.query(Request).filter(Request.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    result = get_nearest_available(db, req)
    if not result:
        return None
    team, dist = result
    return NearestTeamResponse(
        team_id=team.id,
        team_name=team.name,
        team_type=team.type,
        organization=team.org_name,
        distance_meters=round(dist, 1),
        status=team.status,
    )


@router.post("/{request_id}/assign-nearest", response_model=AssignNearestResponse)
def assign_nearest(request_id: int, db: Session = Depends(get_db)):
    req = db.query(Request).filter(Request.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.status == RequestStatus.RESOLVED:
        raise HTTPException(status_code=400, detail="Request already resolved")

    result = get_nearest_available(db, req)
    if not result:
        raise HTTPException(status_code=404, detail="No available teams found")

    team, dist = result
    info = assign_team_to_request(db, req, team, distance_meters=dist)
    return AssignNearestResponse(
        request_id=info["request_id"],
        assigned_team_id=info["assigned_team_id"],
        team_name=info["team_name"],
        distance_meters=round(dist, 1),
        status=info["status"],
    )


@router.patch("/{request_id}/acknowledge")
def acknowledge_request(request_id: int, db: Session = Depends(get_db)):
    """Lightweight acknowledge — marks that a volunteer has seen the task."""
    from datetime import datetime
    req = db.query(Request).filter(Request.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    # Explicitly set updated_at so the onupdate column reflects the ack time
    req.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(req)
    return {"id": req.id, "status": req.status.value, "message": "acknowledged"}


@router.patch("/{request_id}/verify", response_model=RequestOut)
def verify_request(
    request_id: int,
    by: VerifierRole = Query(..., description="volunteer or admin"),
    responder_id: int = Query(..., description="ID of the simulated responder"),
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

    # Create verification row
    ver = Verification(
        request_id=req.id,
        verified_by_role=by,
        verified_by_id=responder_id,
    )
    db.add(ver)

    if req.status == RequestStatus.PENDING:
        req.status = RequestStatus.VERIFIED

    # Small credibility boost for human verification
    req.credibility_score = min(100, (req.credibility_score or 50) + 10)

    db.commit()
    db.refresh(req)
    return _request_to_out(req, db=db)


@router.patch("/{request_id}/resolve", response_model=RequestOut)
def resolve_request(request_id: int, db: Session = Depends(get_db)):
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
