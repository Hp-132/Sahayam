"""
PostGIS helper functions used across the API.
All distances are in meters (Geography type).
"""
from typing import Optional, List, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func
from geoalchemy2.functions import ST_Distance, ST_DWithin
from geoalchemy2.elements import WKTElement

from app.models import Team, Facility, DisasterZone, TeamStatus


def make_point(lat: float, lng: float) -> WKTElement:
    """Create a Geography POINT (SRID 4326). Note: WKT is POINT(lng lat)."""
    return WKTElement(f"POINT({lng} {lat})", srid=4326)


def extract_lat_lng(geom) -> Tuple[Optional[float], Optional[float]]:
    """
    Extract (lat, lng) from a GeoAlchemy geometry.
    Tries shapely first, then WKT parsing.
    Returns (None, None) on failure.
    """
    if geom is None:
        return None, None

    try:
        from geoalchemy2.shape import to_shape
        shape = to_shape(geom)
        return float(shape.y), float(shape.x)  # lat, lng
    except Exception:
        pass

    try:
        wkt = str(geom)
        if "POINT" in wkt.upper():
            inner = wkt[wkt.find("(") + 1 : wkt.find(")")].strip()
            parts = inner.split()
            if len(parts) >= 2:
                lng, lat = float(parts[0]), float(parts[1])
                return lat, lng
    except Exception:
        pass

    return None, None


def is_inside_active_zone(db: Session, location) -> Tuple[bool, Optional[str]]:
    """
    Check whether a Geography POINT lies inside any active disaster zone.
    Returns (inside: bool, zone_name: Optional[str]).
    """
    lat, lng = extract_lat_lng(location)
    if lat is None or lng is None:
        return False, None
    # ST_Contains has no geography overload in PostGIS; ST_Covers does.
    point = func.ST_GeogFromText(f"SRID=4326;POINT({lng} {lat})")
    row = (
        db.query(DisasterZone)
        .filter(
            DisasterZone.active == True,  # noqa: E712
            func.ST_Covers(DisasterZone.boundary, point),
        )
        .first()
    )
    if row:
        return True, row.name
    return False, None


def find_nearest_available_team(
    db: Session, request_location, limit: int = 1
) -> List[Tuple[Team, float]]:
    """
    Return list of (Team, distance_meters) sorted by distance.
    Only AVAILABLE teams are considered.
    """
    q = (
        db.query(
            Team,
            ST_Distance(Team.current_location, request_location).label("dist"),
        )
        .filter(Team.status == TeamStatus.AVAILABLE)
        .order_by("dist")
        .limit(limit)
    )
    return [(row[0], float(row[1])) for row in q.all()]


def facilities_within_radius(
    db: Session,
    lat: float,
    lng: float,
    radius_meters: float,
    facility_type: Optional[str] = None,
) -> List[Tuple[Facility, float]]:
    """
    Return facilities within radius (meters), sorted by distance.
    Uses ST_DWithin + ST_Distance on Geography.
    """
    target = make_point(lat, lng)
    q = db.query(
        Facility,
        ST_Distance(Facility.location, target).label("dist"),
    ).filter(ST_DWithin(Facility.location, target, radius_meters))

    if facility_type:
        q = q.filter(Facility.type == facility_type)

    q = q.order_by("dist")
    return [(row[0], float(row[1])) for row in q.all()]
