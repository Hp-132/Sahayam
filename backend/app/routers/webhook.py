"""
SMS Gateway webhook.
Android SMS Gateway → POST /webhook/sms → parse → duplicate → credibility → PostgreSQL.
Only processes messages beginning with DR1|.
"""
from fastapi import APIRouter, Request as FastAPIRequest, Depends, HTTPException
from sqlalchemy.orm import Session

from app.deps import get_db
from app.models import (
    Request, RequestType, Severity, LocationSource, RequestSource, RequestStatus,
)
from app.services.sms_parser import parse_disaster_sms
from app.services.geocoding import geocode_landmark
from app.services.geo import make_point
from app.services.duplicate_detector import find_duplicates
from app.services.credibility import calculate_credibility
from app.services.track_id import generate_track_id
from app.services.priority import priority_for_type
from app.services.ngo_coordination import broadcast_critical

router = APIRouter(tags=["webhook"])


def extract_sms_body(payload: dict) -> str:
    """Handles both possible Gateway payload shapes."""
    if isinstance(payload.get("payload"), dict):
        nested = (
            payload["payload"].get("message")
            or payload["payload"].get("text")
            or payload["payload"].get("body")
        )
        if nested:
            return nested
    return payload.get("message") or payload.get("text") or payload.get("body") or ""


@router.post("/webhook/sms")
async def receive_sms(request: FastAPIRequest, db: Session = Depends(get_db)):
    payload = await request.json()
    sms_body = extract_sms_body(payload)

    if not sms_body.strip().startswith("DR1|"):
        # Explicitly ignore unrelated SMS — do not store or log content
        return {"status": "ignored"}

    parsed = parse_disaster_sms(sms_body)
    if "error" in parsed:
        return {"status": "rejected", "reason": parsed["error"]}

    # Resolve location
    lat = parsed.get("lat")
    lng = parsed.get("lng")
    location_source = LocationSource.GPS if parsed["location_source"] == "gps" else LocationSource.LANDMARK
    landmark_text = parsed.get("landmark_text")

    if location_source == LocationSource.LANDMARK:
        geo = geocode_landmark(landmark_text or "")
        if geo:
            lat, lng = geo["latitude"], geo["longitude"]
        else:
            # Safe fallback so the request is not lost
            lat = 21.1702
            lng = 72.8311

    if lat is None or lng is None:
        return {"status": "rejected", "reason": "unresolvable_location"}

    location = make_point(lat, lng)
    req_type = RequestType(parsed["type"])
    # The DR1 SEV field is kept for protocol compatibility, but priority is always
    # the backend's type-based mapping (senders cannot escalate / downgrade it)
    severity = priority_for_type(req_type)
    headcount = parsed["people_count"]

    # Duplicate detection
    dup = find_duplicates(
        db,
        lat=lat,
        lng=lng,
        location=location,
        type_value=req_type.value,
        severity_value=severity.value,
        headcount=headcount,
        landmark_text=landmark_text,
    )
    is_dup = bool(dup and dup.get("is_duplicate"))

    if is_dup and dup.get("matched_request_id"):
        matched = db.query(Request).filter(Request.id == dup["matched_request_id"]).first()
        if matched:
            matched.report_count = (matched.report_count or 1) + 1
            cred_m = calculate_credibility(
                db,
                location=matched.location,
                location_source=matched.location_source,
                is_duplicate=False,
                corroboration_count=max(0, matched.report_count - 1),
            )
            matched.credibility_score = cred_m["score"]
            db.commit()

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
        citizen_id=None,
        type=req_type,
        severity=severity,
        headcount=headcount,
        location=location,
        location_source=location_source,
        landmark_text=landmark_text,
        status=RequestStatus.PENDING,
        credibility_score=cred["score"],
        report_count=1,
        source=RequestSource.SMS,
        raw_sms=parsed.get("raw_sms") or sms_body.strip(),
    )
    db.add(req)
    db.commit()
    db.refresh(req)

    ngos_notified = 0
    if severity == Severity.C and not is_dup:
        ngos_notified = len(broadcast_critical(db, req))
        db.refresh(req)

    return {
        "status": "accepted",
        "request_id": req.id,
        "track_id": req.track_id,
        "credibility_score": req.credibility_score,
        "is_duplicate": is_dup,
        "ngos_notified": ngos_notified,
        "parsed": {
            "type": req.type.value,
            "severity": req.severity.value,
            "headcount": req.headcount,
            "location_source": req.location_source.value,
            "lat": lat,
            "lng": lng,
        },
    }
