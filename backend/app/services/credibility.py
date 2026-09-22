"""
Explainable, deterministic credibility engine.
No ML / LLM.
"""
from typing import Dict, Any, Optional
from sqlalchemy.orm import Session

from app.models import Request, LocationSource
from app.services.geo import is_inside_active_zone


def calculate_credibility(
    db: Session,
    *,
    location,
    location_source: LocationSource,
    is_duplicate: bool = False,
    corroboration_count: int = 0,
) -> Dict[str, Any]:
    """
    Rule-based credibility score (0-100).

    START: 50
    +20 * corroboration_count
    +15 if inside active disaster zone
    -30 if outside active disaster zones
    +10 if GPS
    -25 if flagged as duplicate
    clamp 0-100
    """
    score = 50
    breakdown = {"base": 50}

    inside, zone_name = is_inside_active_zone(db, location)
    if inside:
        score += 15
        breakdown["inside_disaster_zone"] = 15
    else:
        score -= 30
        breakdown["outside_disaster_zone"] = -30

    gps_verified = location_source == LocationSource.GPS
    if gps_verified:
        score += 10
        breakdown["gps"] = 10

    if is_duplicate:
        score -= 25
        breakdown["duplicate"] = -25

    if corroboration_count > 0:
        bonus = 20 * corroboration_count
        score += bonus
        breakdown["corroboration"] = bonus

    final = max(0, min(100, score))

    return {
        "score": final,
        "inside_disaster_zone": inside,
        "zone_name": zone_name,
        "gps_verified": gps_verified,
        "duplicate_detected": is_duplicate,
        "corroboration_count": corroboration_count,
        "score_breakdown": breakdown,
    }


def recalculate_for_request(db: Session, req: Request, is_duplicate: bool = False) -> int:
    """Update and return the credibility_score for an existing Request row."""
    result = calculate_credibility(
        db,
        location=req.location,
        location_source=req.location_source,
        is_duplicate=is_duplicate,
        corroboration_count=max(0, (req.report_count or 1) - 1),
    )
    req.credibility_score = result["score"]
    return result["score"]
