"""Facilities: sync from Overpass + nearby queries via PostGIS."""
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.deps import get_db
from app.models import Facility, FacilityType
from app.schemas.facility import FacilityOut, FacilitySyncResult, SafeAreaOut
from app.services.overpass import sync_facilities
from app.services.geo import facilities_within_radius, extract_lat_lng
from app.config import DEFAULT_NEARBY_RADIUS_METERS

router = APIRouter(prefix="/api/facilities", tags=["facilities"])


@router.post("/sync", response_model=FacilitySyncResult)
def facilities_sync(db: Session = Depends(get_db)):
    """
    Pull real hospitals/clinics/shelters/camps from OpenStreetMap Overpass
    and upsert into the facilities table.
    """
    try:
        result = sync_facilities(db)
        return FacilitySyncResult(
            inserted=result["inserted"],
            updated=result["updated"],
            total_fetched=result["total_fetched"],
            message=f"Synced {result['total_fetched']} facilities from Overpass",
        )
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Overpass sync failed: {str(e)[:200]}",
        )


@router.get("", response_model=List[FacilityOut])
def list_facilities(
    type: Optional[FacilityType] = None,
    limit: int = Query(200, ge=1, le=1000),
    db: Session = Depends(get_db),
):
    q = db.query(Facility)
    if type:
        q = q.filter(Facility.type == type)
    rows = q.limit(limit).all()
    out = []
    for f in rows:
        lat, lng = extract_lat_lng(f.location)
        out.append(FacilityOut(
            id=f.id, name=f.name, type=f.type, address=f.address,
            latitude=lat, longitude=lng, source_osm_id=f.source_osm_id,
        ))
    return out


@router.get("/nearby", response_model=List[FacilityOut])
def nearby_facilities(
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
    radius: float = Query(DEFAULT_NEARBY_RADIUS_METERS, ge=100, le=50000),
    type: Optional[FacilityType] = None,
    db: Session = Depends(get_db),
):
    """
    PostGIS ST_DWithin + ST_Distance.
    Does NOT call Overpass — uses the cached facilities table.
    """
    results = facilities_within_radius(
        db, lat, lng, radius,
        facility_type=type.value if type else None,
    )
    out = []
    for f, dist in results:
        flat, flng = extract_lat_lng(f.location)
        out.append(FacilityOut(
            id=f.id, name=f.name, type=f.type, address=f.address,
            latitude=flat, longitude=flng,
            distance_meters=round(dist, 1),
            source_osm_id=f.source_osm_id,
        ))
    return out


@router.get("/safe-areas/nearby", response_model=List[SafeAreaOut], include_in_schema=True)
def safe_areas_nearby(
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
    radius: float = Query(DEFAULT_NEARBY_RADIUS_METERS, ge=100, le=50000),
    db: Session = Depends(get_db),
):
    """
    Known nearby shelters/camps/facilities (OSM-derived).
    Does NOT claim official 'safe zone' status.
    """
    # Prefer shelter + camp, fall back to any facility
    results = facilities_within_radius(db, lat, lng, radius)
    out = []
    for f, dist in results:
        if f.type.value not in ("shelter", "camp", "hospital", "clinic"):
            continue
        flat, flng = extract_lat_lng(f.location)
        out.append(SafeAreaOut(
            id=f.id, name=f.name, type=f.type, address=f.address,
            latitude=flat, longitude=flng,
            distance_meters=round(dist, 1),
        ))
    return out


# Also expose under /api/safe-areas/nearby for the exact path requested
from fastapi import APIRouter as _AR
safe_router = _AR(prefix="/api/safe-areas", tags=["safe-areas"])


@safe_router.get("/nearby", response_model=List[SafeAreaOut])
def safe_areas_nearby_alias(
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
    radius: float = Query(DEFAULT_NEARBY_RADIUS_METERS, ge=100, le=50000),
    db: Session = Depends(get_db),
):
    return safe_areas_nearby(lat=lat, lng=lng, radius=radius, db=db)
