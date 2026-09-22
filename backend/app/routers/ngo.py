"""
NGO / relief organisation portal: registration, sign-in, profile, availability,
and accept / reject / progress of the requests offered to the organisation.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import DEMO_NGO_PASSWORD
from app.deps import get_db, get_current_ngo
from app.models import (
    NgoAccount, Team, RequestAssignment, TeamStatus, AssignmentStatus, AssignmentMode,
)
from app.schemas.ngo import NgoRegister, NgoSignin, NgoAvailability, NgoReject, ORG_TYPES
from app.services.auth import hash_password, verify_password, issue_session_token
from app.services.geo import make_point, extract_lat_lng
from app.services.geocoding import geocode_landmark
from app.services.ngo_coordination import (
    SERVICE_CODES, primary_type, team_services, team_loads, refresh_team_status,
    accept_assignment, reject_assignment, mark_on_the_way, complete_assignment,
    alternatives_for, assignment_dict, request_brief, COMMITTED,
)

router = APIRouter(prefix="/api/ngo", tags=["ngo"])


def _profile(acc: NgoAccount, db: Session) -> dict:
    t = acc.team
    lat, lng = extract_lat_lng(t.current_location)
    return {
        "account_id": acc.id,
        "team_id": t.id,
        "org_name": t.org_name or t.name,
        "unit_name": t.name,
        "org_type": acc.org_type,
        "contact_person": acc.contact_person,
        "phone": acc.phone,
        "email": acc.email,
        "registration_number": acc.registration_number,
        "years_experience": acc.years_experience,
        "operating_areas": acc.operating_areas,
        "headquarters": acc.headquarters,
        "team_size": acc.team_size,
        "latitude": lat,
        "longitude": lng,
        "services": team_services(t),
        "capacity": t.capacity,
        "active_load": team_loads(db, [t.id]).get(t.id, 0),
        "status": t.status.value,
        "self_registered": acc.self_registered,
    }


def _auth_response(acc: NgoAccount, db: Session) -> dict:
    return {"token": acc.session_token, "ngo": _profile(acc, db)}


@router.get("/options")
def registration_options():
    return {"org_types": ORG_TYPES, "services": SERVICE_CODES}


@router.post("/register", status_code=201)
def register(body: NgoRegister, db: Session = Depends(get_db)):
    if db.query(NgoAccount).filter(NgoAccount.email == body.email).first():
        raise HTTPException(status_code=409, detail="Email already registered")
    if db.query(NgoAccount).filter(NgoAccount.phone == body.phone).first():
        raise HTTPException(status_code=409, detail="Phone number already registered")

    lat, lng = body.latitude, body.longitude
    if lat is None or lng is None:
        geo = geocode_landmark(body.headquarters)
        if not geo:
            raise HTTPException(
                status_code=422,
                detail="Could not locate the headquarters address. Use 'Detect location' or enter coordinates.",
            )
        lat, lng = geo["latitude"], geo["longitude"]

    team = Team(
        name=body.org_name,
        org_name=body.org_name,
        type=primary_type(body.services),
        current_location=make_point(lat, lng),
        status=TeamStatus.AVAILABLE,
        services=",".join(body.services),
        capacity=body.capacity,
    )
    acc = NgoAccount(
        team=team,
        org_type=body.org_type,
        contact_person=body.contact_person,
        phone=body.phone,
        email=body.email,
        registration_number=body.registration_number,
        years_experience=body.years_experience,
        operating_areas=body.operating_areas,
        headquarters=body.headquarters,
        team_size=body.team_size,
        password_hash=hash_password(body.password),
        session_token=issue_session_token(),
        self_registered=True,
    )
    db.add(team)
    db.add(acc)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Email or phone already registered")
    db.refresh(acc)
    return _auth_response(acc, db)


@router.post("/signin")
def signin(body: NgoSignin, db: Session = Depends(get_db)):
    login = body.login.strip()
    acc = (
        db.query(NgoAccount)
        .filter((NgoAccount.email == login.lower()) | (NgoAccount.phone == login))
        .first()
    )
    if not acc or not verify_password(body.password, acc.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email/phone or password")
    acc.session_token = issue_session_token()
    db.commit()
    db.refresh(acc)
    return _auth_response(acc, db)


@router.post("/signout")
def signout(acc: NgoAccount = Depends(get_current_ngo), db: Session = Depends(get_db)):
    acc.session_token = None
    db.commit()
    return {"status": "ok"}


@router.get("/demo-accounts")
def demo_accounts(db: Session = Depends(get_db)):
    """Seeded demo organisations (not self-registered ones) for the demo sign-in helper."""
    rows = (
        db.query(NgoAccount)
        .join(Team)
        .filter(NgoAccount.self_registered == False)  # noqa: E712
        .order_by(Team.name)
        .all()
    )
    return {
        "password": DEMO_NGO_PASSWORD,
        "accounts": [
            {"email": a.email, "unit_name": a.team.name, "org_name": a.team.org_name, "status": a.team.status.value}
            for a in rows
        ],
    }


@router.get("/me")
def me(acc: NgoAccount = Depends(get_current_ngo), db: Session = Depends(get_db)):
    return _profile(acc, db)


@router.patch("/me/availability")
def set_availability(
    body: NgoAvailability,
    acc: NgoAccount = Depends(get_current_ngo),
    db: Session = Depends(get_db),
):
    team = acc.team
    if body.available:
        team.status = TeamStatus.AVAILABLE
        refresh_team_status(db, team)  # may immediately be busy if at capacity
    else:
        team.status = TeamStatus.UNAVAILABLE
    db.commit()
    return _profile(acc, db)


@router.get("/assignments")
def my_assignments(acc: NgoAccount = Depends(get_current_ngo), db: Session = Depends(get_db)):
    """Every request offered to this organisation, with the request details and other NGOs' responses."""
    rows = (
        db.query(RequestAssignment)
        .filter(RequestAssignment.team_id == acc.team_id)
        .order_by(RequestAssignment.created_at.desc())
        .all()
    )
    out = []
    for a in rows:
        req = a.request
        others = [x for x in req.assignments if x.team_id != acc.team_id]
        out.append({
            **assignment_dict(a),
            "request": request_brief(req),
            "other_ngos_notified": len({x.team_id for x in others if x.mode == AssignmentMode.BROADCAST.value}),
            "other_ngos_accepted": sorted({
                x.team.name for x in others
                if x.status in COMMITTED or x.status == AssignmentStatus.COMPLETED.value
            }),
        })
    return out


def _own_assignment(assignment_id: int, acc: NgoAccount, db: Session) -> RequestAssignment:
    a = db.query(RequestAssignment).filter(RequestAssignment.id == assignment_id).first()
    if not a or a.team_id != acc.team_id:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return a


@router.post("/assignments/{assignment_id}/accept")
def accept(assignment_id: int, acc: NgoAccount = Depends(get_current_ngo), db: Session = Depends(get_db)):
    a = _own_assignment(assignment_id, acc, db)
    accept_assignment(db, a)
    db.refresh(a)
    return assignment_dict(a)


@router.post("/assignments/{assignment_id}/reject")
def reject(
    assignment_id: int,
    body: NgoReject,
    acc: NgoAccount = Depends(get_current_ngo),
    db: Session = Depends(get_db),
):
    a = _own_assignment(assignment_id, acc, db)
    reject_assignment(db, a, body.reason)
    db.refresh(a)
    # Next suitable nearby NGOs, surfaced to the admin for reassignment
    alts = alternatives_for(db, a.request)
    return {**assignment_dict(a), "alternatives_found": len(alts)}


@router.post("/assignments/{assignment_id}/on-the-way")
def on_the_way(assignment_id: int, acc: NgoAccount = Depends(get_current_ngo), db: Session = Depends(get_db)):
    a = _own_assignment(assignment_id, acc, db)
    mark_on_the_way(db, a)
    db.refresh(a)
    return assignment_dict(a)


@router.post("/assignments/{assignment_id}/complete")
def complete(assignment_id: int, acc: NgoAccount = Depends(get_current_ngo), db: Session = Depends(get_db)):
    a = _own_assignment(assignment_id, acc, db)
    complete_assignment(db, a)
    db.refresh(a)
    return assignment_dict(a)
