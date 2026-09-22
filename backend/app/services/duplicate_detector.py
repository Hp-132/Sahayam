"""
Duplicate detection using RapidFuzz (text) + PostGIS (spatial).
"""
from typing import Optional, Dict, Any, List
from sqlalchemy.orm import Session
from rapidfuzz import fuzz
from geoalchemy2.functions import ST_Distance, ST_DWithin

from app.models import Request
from app.config import DUPLICATE_DISTANCE_METERS, DUPLICATE_TEXT_SIMILARITY
from app.services.geo import make_point


def _text_for_request(req: Request) -> str:
    """Build a comparable text blob from a request."""
    parts = [req.type.value if req.type else ""]
    if req.other_description:
        parts.append(req.other_description)
    if req.landmark_text:
        parts.append(req.landmark_text)
    parts.append(str(req.headcount))
    parts.append(req.severity.value if req.severity else "")
    return " ".join(parts).strip().lower()


def find_duplicates(
    db: Session,
    *,
    lat: Optional[float],
    lng: Optional[float],
    location,
    type_value: str,
    severity_value: str,
    headcount: int,
    other_description: Optional[str] = None,
    landmark_text: Optional[str] = None,
    exclude_id: Optional[int] = None,
    distance_meters: float = DUPLICATE_DISTANCE_METERS,
    text_threshold: float = DUPLICATE_TEXT_SIMILARITY,
) -> Optional[Dict[str, Any]]:
    """
    Look for a potential duplicate of the incoming request.

    A candidate is a duplicate when:
      - geographic distance <= distance_meters  AND
      - text/type similarity >= text_threshold

    Returns the best match dict or None.
    """
    # Spatial candidates
    q = db.query(
        Request,
        ST_Distance(Request.location, location).label("dist"),
    ).filter(ST_DWithin(Request.location, location, distance_meters))

    if exclude_id is not None:
        q = q.filter(Request.id != exclude_id)

    candidates = q.all()
    if not candidates:
        return None

    incoming_text = " ".join(
        filter(
            None,
            [
                type_value,
                other_description or "",
                landmark_text or "",
                str(headcount),
                severity_value,
            ],
        )
    ).strip().lower()

    best = None
    best_score = -1.0

    for req, dist in candidates:
        # Type must match for strong duplicate signal
        if req.type.value != type_value:
            # Still allow high text similarity, but penalise
            type_bonus = 0
        else:
            type_bonus = 10

        candidate_text = _text_for_request(req)
        if not incoming_text and not candidate_text:
            # Pure spatial + type + severity + headcount match
            sim = 90.0 if (
                req.type.value == type_value
                and req.severity.value == severity_value
                and req.headcount == headcount
            ) else 40.0
        else:
            sim = float(fuzz.token_set_ratio(incoming_text, candidate_text))

        sim += type_bonus
        sim = min(100.0, sim)

        if sim >= text_threshold and sim > best_score:
            best_score = sim
            best = {
                "is_duplicate": True,
                "matched_request_id": req.id,
                "similarity": round(sim, 1),
                "distance_meters": round(float(dist), 1),
            }

    return best


def check_request_duplicates(db: Session, request_id: int) -> Optional[Dict[str, Any]]:
    """Convenience: find duplicates for an already-stored request."""
    req = db.query(Request).filter(Request.id == request_id).first()
    if not req:
        return None

    return find_duplicates(
        db,
        lat=None,
        lng=None,
        location=req.location,
        type_value=req.type.value,
        severity_value=req.severity.value,
        headcount=req.headcount,
        other_description=req.other_description,
        landmark_text=req.landmark_text,
        exclude_id=req.id,
    )
