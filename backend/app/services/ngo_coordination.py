"""
NGO coordination: capability matching, PostGIS candidate ranking, direct
assignment offers, critical broadcast, NGO accept / reject / progress, and
organisation workload -> availability bookkeeping.

Lifecycle of one request (requests.response_stage):
    None -> awaiting_response -> accepted -> on_the_way -> completed
                    \\-> rejected (every offered NGO declined; admin reassigns)
Every NGO offer is a RequestAssignment row, so rejections are never lost.
"""
from datetime import datetime
from typing import Dict, Iterable, List, Optional

from fastapi import HTTPException
from geoalchemy2.functions import ST_Distance, ST_DWithin
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from app.config import (
    NGO_CANDIDATE_RADIUS_METERS,
    CRITICAL_BROADCAST_RADIUS_METERS,
    CRITICAL_BROADCAST_FALLBACK_RADIUS_METERS,
    CRITICAL_BROADCAST_MAX_NGOS,
)
from app.models import (
    Request, Team, RequestAssignment, RequestType, RequestStatus, Severity, TeamStatus,
    ResponseStage, AssignmentStatus, AssignmentMode,
)
from app.services.geo import extract_lat_lng

SERVICE_CODES = ["medical", "rescue", "fire", "evacuation", "food", "shelter", "clothing", "supplies"]

# Which organisation services can handle each request type (empty set = any organisation)
REQUIRED_SERVICES = {
    RequestType.MED: {"medical"},
    RequestType.SAR: {"rescue"},
    RequestType.FIRE: {"fire", "rescue"},
    RequestType.MISSING: {"rescue"},
    RequestType.EVAC: {"evacuation", "rescue"},
    RequestType.SHELTER: {"shelter"},
    RequestType.FOOD: {"food"},
    RequestType.CLOTHES: {"clothing"},
    RequestType.SUPPLIES: {"supplies", "medical"},
    RequestType.OTHER: set(),
}

# Services assumed for teams created before services were recorded (by legacy team.type)
_LEGACY_SERVICES = {
    "medical": ["medical", "supplies"],
    "rescue": ["rescue", "evacuation"],
    "general": ["food", "shelter", "clothing", "supplies"],
}

OPEN = (AssignmentStatus.OFFERED.value, AssignmentStatus.ACCEPTED.value, AssignmentStatus.ON_THE_WAY.value)
COMMITTED = (AssignmentStatus.ACCEPTED.value, AssignmentStatus.ON_THE_WAY.value)
_STAGE_RANK = {
    AssignmentStatus.OFFERED.value: (0, ResponseStage.AWAITING.value),
    AssignmentStatus.ACCEPTED.value: (1, ResponseStage.ACCEPTED.value),
    AssignmentStatus.ON_THE_WAY.value: (2, ResponseStage.ON_THE_WAY.value),
}


# ---------------------------------------------------------------------------
# capability + workload
# ---------------------------------------------------------------------------
def team_services(team: Team) -> List[str]:
    if team.services:
        return [s.strip() for s in team.services.split(",") if s.strip()]
    return _LEGACY_SERVICES.get((team.type or "").lower(), _LEGACY_SERVICES["general"])


def primary_type(services) -> str:
    """Legacy teams.type specialisation (medical / rescue / general) derived from services."""
    if "medical" in services:
        return "medical"
    if {"rescue", "fire", "evacuation"} & set(services):
        return "rescue"
    return "general"


def is_capable(team: Team, req_type) -> bool:
    needed = REQUIRED_SERVICES.get(RequestType(req_type), set())
    return not needed or bool(needed & set(team_services(team)))


def team_loads(db: Session, team_ids: Optional[Iterable[int]] = None) -> Dict[int, int]:
    """
    Active workload per team: accepted / on-the-way requests plus direct offers
    awaiting a reply. Open critical-broadcast offers are notifications only and
    do not reserve capacity until accepted.
    """
    db.flush()
    q = db.query(RequestAssignment.team_id, func.count(RequestAssignment.id)).filter(
        or_(
            RequestAssignment.status.in_(COMMITTED),
            and_(
                RequestAssignment.status == AssignmentStatus.OFFERED.value,
                RequestAssignment.mode == AssignmentMode.DIRECT.value,
            ),
        )
    )
    if team_ids is not None:
        ids = list(team_ids)
        if not ids:
            return {}
        q = q.filter(RequestAssignment.team_id.in_(ids))
    return {tid: int(n) for tid, n in q.group_by(RequestAssignment.team_id).all()}


def refresh_team_status(db: Session, team: Optional[Team]) -> None:
    """Available <-> Busy follows workload vs capacity. Unavailable is only set by the NGO."""
    if team is None or team.status == TeamStatus.UNAVAILABLE:
        return
    load = team_loads(db, [team.id]).get(team.id, 0)
    team.status = TeamStatus.BUSY if load >= max(1, team.capacity or 1) else TeamStatus.AVAILABLE


def _refresh_teams(db: Session, team_ids: Iterable[int]) -> None:
    ids = {t for t in team_ids if t}
    if not ids:
        return
    for team in db.query(Team).filter(Team.id.in_(ids)).all():
        refresh_team_status(db, team)


# ---------------------------------------------------------------------------
# candidate search (PostGIS)
# ---------------------------------------------------------------------------
def _involved_team_ids(req: Request) -> set:
    """Teams that already rejected or currently hold an open offer for this request."""
    return {
        a.team_id for a in req.assignments
        if a.status in OPEN or a.status == AssignmentStatus.REJECTED.value
    }


def find_candidate_ngos(
    db: Session,
    req: Request,
    radius_meters: float = NGO_CANDIDATE_RADIUS_METERS,
    exclude_team_ids: Iterable[int] = (),
    limit: Optional[int] = None,
) -> List[dict]:
    """
    Suitable NGOs near a request: available, capable of the request type, with
    spare capacity, inside radius. Ranked by distance weighted by workload.
    """
    dist = ST_Distance(Team.current_location, req.location)
    q = db.query(Team, dist.label("dist")).filter(
        Team.status == TeamStatus.AVAILABLE,
        ST_DWithin(Team.current_location, req.location, radius_meters),
    )
    exclude = list(exclude_team_ids)
    if exclude:
        q = q.filter(~Team.id.in_(exclude))
    rows = q.order_by("dist").all()

    loads = team_loads(db, [t.id for t, _ in rows])
    out = []
    for team, d in rows:
        if not is_capable(team, req.type):
            continue
        load = loads.get(team.id, 0)
        cap = max(1, team.capacity or 1)
        if load >= cap:
            continue
        out.append({
            "team": team,
            "distance_meters": float(d),
            "active_load": load,
            "capacity": cap,
            # a half-loaded NGO counts as 25% further away than an idle one
            "score": float(d) * (1 + 0.5 * load / cap),
        })
    out.sort(key=lambda c: c["score"])
    return out[:limit] if limit else out


def alternatives_for(db: Session, req: Request, limit: int = 5) -> List[dict]:
    return find_candidate_ngos(db, req, exclude_team_ids=_involved_team_ids(req), limit=limit)


# ---------------------------------------------------------------------------
# request stage bookkeeping
# ---------------------------------------------------------------------------
def recompute_request_stage(req: Request) -> None:
    """Derive requests.status / response_stage / assigned_team_id from its assignments."""
    if req.status == RequestStatus.RESOLVED:
        return
    active = [a for a in req.assignments if a.status in OPEN]
    if active:
        req.status = RequestStatus.DISPATCHED
        req.response_stage = max((_STAGE_RANK[a.status] for a in active), key=lambda r: r[0])[1]
        if req.assigned_team_id not in {a.team_id for a in active}:
            committed = [a for a in active if a.status in COMMITTED]
            direct = [a for a in active if a.mode == AssignmentMode.DIRECT.value]
            lead = (committed or direct or [None])[0]
            req.assigned_team_id = lead.team_id if lead else None
        return

    req.assigned_team_id = None
    rejected = any(a.status == AssignmentStatus.REJECTED.value for a in req.assignments)
    req.response_stage = ResponseStage.REJECTED.value if rejected else None
    req.status = RequestStatus.VERIFIED if req.verifications else RequestStatus.PENDING


def _distance(db: Session, req: Request, team: Team) -> Optional[int]:
    try:
        d = db.query(ST_Distance(req.location, team.current_location)).scalar()
        return int(round(float(d))) if d is not None else None
    except Exception:
        return None


# ---------------------------------------------------------------------------
# admin actions
# ---------------------------------------------------------------------------
def offer_direct(db: Session, req: Request, team: Team, distance_meters: Optional[float] = None) -> RequestAssignment:
    """
    Admin assigns (or reassigns) a request to one NGO. The NGO must accept before
    the citizen is told help is on the way. Any previous direct / lead assignment
    held by another NGO is withdrawn, but stays in the history.
    """
    if req.status == RequestStatus.RESOLVED:
        raise HTTPException(status_code=400, detail="Request already resolved")

    for a in req.assignments:
        if a.team_id == team.id and a.status in OPEN:
            if a.mode == AssignmentMode.BROADCAST.value:
                # already notified via critical broadcast: promote to a direct assignment
                a.mode = AssignmentMode.DIRECT.value
                req.assigned_team_id = team.id
                recompute_request_stage(req)
                refresh_team_status(db, team)
                db.commit()
            return a

    if team.status != TeamStatus.AVAILABLE:
        raise HTTPException(status_code=400, detail="Team is not available")

    touched = {team.id}
    for a in req.assignments:
        if a.status in OPEN and (a.mode == AssignmentMode.DIRECT.value or a.team_id == req.assigned_team_id):
            a.status = AssignmentStatus.WITHDRAWN.value
            a.responded_at = a.responded_at or datetime.utcnow()
            touched.add(a.team_id)
    if req.assigned_team_id:
        touched.add(req.assigned_team_id)

    assignment = RequestAssignment(
        team_id=team.id,
        mode=AssignmentMode.DIRECT.value,
        status=AssignmentStatus.OFFERED.value,
        distance_meters=int(round(distance_meters)) if distance_meters is not None else _distance(db, req, team),
    )
    req.assignments.append(assignment)
    req.assigned_team_id = team.id
    recompute_request_stage(req)
    _refresh_teams(db, touched)
    db.commit()
    db.refresh(assignment)
    return assignment


def broadcast_critical(db: Session, req: Request) -> List[RequestAssignment]:
    """
    Forward a CRITICAL request to every suitable NGO in the affected area
    (not to distant / unrelated organisations). Returns the new offers.
    """
    if req.severity != Severity.C:
        raise HTTPException(status_code=400, detail="Only critical requests are broadcast")
    if req.status == RequestStatus.RESOLVED:
        raise HTTPException(status_code=400, detail="Request already resolved")

    exclude = _involved_team_ids(req)
    cands = find_candidate_ngos(db, req, CRITICAL_BROADCAST_RADIUS_METERS, exclude, CRITICAL_BROADCAST_MAX_NGOS)
    if not cands:
        cands = find_candidate_ngos(
            db, req, CRITICAL_BROADCAST_FALLBACK_RADIUS_METERS, exclude, CRITICAL_BROADCAST_MAX_NGOS
        )
    offers = []
    for c in cands:
        a = RequestAssignment(
            team_id=c["team"].id,
            mode=AssignmentMode.BROADCAST.value,
            status=AssignmentStatus.OFFERED.value,
            distance_meters=int(round(c["distance_meters"])),
        )
        req.assignments.append(a)
        offers.append(a)
    if offers:
        recompute_request_stage(req)
        db.commit()
    return offers


# ---------------------------------------------------------------------------
# NGO actions
# ---------------------------------------------------------------------------
def _require(a: RequestAssignment, allowed: tuple, action: str) -> None:
    if a.request.status == RequestStatus.RESOLVED:
        raise HTTPException(status_code=409, detail="Request is already resolved")
    if a.status not in allowed:
        raise HTTPException(status_code=409, detail=f"Cannot {action}: assignment is {a.status.replace('_', ' ')}")


def accept_assignment(db: Session, a: RequestAssignment) -> None:
    _require(a, (AssignmentStatus.OFFERED.value,), "accept")
    team = a.team
    if team.status == TeamStatus.UNAVAILABLE:
        raise HTTPException(status_code=409, detail="Set your organisation to Available before accepting requests")
    if a.mode == AssignmentMode.BROADCAST.value:
        load = team_loads(db, [team.id]).get(team.id, 0)
        if load >= max(1, team.capacity or 1):
            raise HTTPException(status_code=409, detail="Your organisation is at full capacity")

    a.status = AssignmentStatus.ACCEPTED.value
    a.responded_at = datetime.utcnow()
    recompute_request_stage(a.request)
    refresh_team_status(db, team)
    db.commit()


def reject_assignment(db: Session, a: RequestAssignment, reason: Optional[str]) -> None:
    _require(a, (AssignmentStatus.OFFERED.value,), "reject")
    a.status = AssignmentStatus.REJECTED.value
    a.rejection_reason = (reason or "").strip() or "No reason given"
    a.responded_at = datetime.utcnow()
    req = a.request
    if req.assigned_team_id == a.team_id:
        req.assigned_team_id = None
    recompute_request_stage(req)
    refresh_team_status(db, a.team)
    db.commit()


def mark_on_the_way(db: Session, a: RequestAssignment) -> None:
    _require(a, (AssignmentStatus.ACCEPTED.value,), "start travel")
    a.status = AssignmentStatus.ON_THE_WAY.value
    recompute_request_stage(a.request)
    db.commit()


def complete_assignment(db: Session, a: RequestAssignment) -> None:
    _require(a, COMMITTED, "complete")
    close_request(db, a.request)
    db.commit()


def close_request(db: Session, req: Request) -> None:
    """Mark request resolved: committed NGOs complete, unanswered offers are withdrawn. No commit."""
    touched = {req.assigned_team_id}
    completed = False
    for a in req.assignments:
        if a.status in COMMITTED:
            a.status = AssignmentStatus.COMPLETED.value
            completed = True
        elif a.status == AssignmentStatus.OFFERED.value:
            a.status = AssignmentStatus.WITHDRAWN.value
            a.responded_at = a.responded_at or datetime.utcnow()
        completed = completed or a.status == AssignmentStatus.COMPLETED.value
        touched.add(a.team_id)
    req.status = RequestStatus.RESOLVED
    if completed:
        req.response_stage = ResponseStage.COMPLETED.value
    _refresh_teams(db, touched)


# ---------------------------------------------------------------------------
# serialisation
# ---------------------------------------------------------------------------
def assignment_dict(a: RequestAssignment) -> dict:
    t = a.team
    return {
        "id": a.id,
        "request_id": a.request_id,
        "team_id": a.team_id,
        "team_name": t.name if t else None,
        "org_name": t.org_name if t else None,
        "mode": a.mode,
        "status": a.status,
        "distance_meters": a.distance_meters,
        "rejection_reason": a.rejection_reason,
        "created_at": a.created_at.isoformat() if a.created_at else None,
        "responded_at": a.responded_at.isoformat() if a.responded_at else None,
    }


def candidate_dict(c: dict) -> dict:
    t = c["team"]
    return {
        "team_id": t.id,
        "team_name": t.name,
        "org_name": t.org_name,
        "services": team_services(t),
        "distance_meters": round(c["distance_meters"], 1),
        "active_load": c["active_load"],
        "capacity": c["capacity"],
        "status": t.status.value,
    }


def request_brief(req: Request) -> dict:
    lat, lng = extract_lat_lng(req.location)
    return {
        "id": req.id,
        "track_id": req.track_id,
        "type": req.type.value,
        "other_description": req.other_description,
        "severity": req.severity.value,
        "headcount": req.headcount,
        "status": req.status.value,
        "response_stage": req.response_stage,
        "latitude": lat,
        "longitude": lng,
        "landmark_text": req.landmark_text,
        "location_source": req.location_source.value if req.location_source else None,
        "source": req.source.value if req.source else None,
        "credibility_score": req.credibility_score,
        "report_count": req.report_count,
        "assigned_team_id": req.assigned_team_id,
        "created_at": req.created_at.isoformat() if req.created_at else None,
    }
