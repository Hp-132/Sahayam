"""
MapLibre-ready GeoJSON endpoints.
Coordinates are always [longitude, latitude].
"""
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.deps import get_db
from app.models import Request, Team, Facility, DisasterZone, Severity, RequestStatus
from app.schemas.map import GeoJSONFeatureCollection, GeoJSONFeature, GeoJSONGeometry
from app.services.geo import extract_lat_lng
from geoalchemy2.shape import to_shape

router = APIRouter(prefix="/api/map", tags=["map"])

SEVERITY_WEIGHT = {
    Severity.C: 1.0,
    Severity.M: 0.6,
    Severity.L: 0.3,
}


@router.get("/requests", response_model=GeoJSONFeatureCollection)
def map_requests(
    status: Optional[RequestStatus] = None,
    severity: Optional[Severity] = None,
    limit: int = Query(500, ge=1, le=2000),
    db: Session = Depends(get_db),
):
    q = db.query(Request)
    if status:
        q = q.filter(Request.status == status)
    if severity:
        q = q.filter(Request.severity == severity)
    rows = q.limit(limit).all()

    features = []
    for r in rows:
        lat, lng = extract_lat_lng(r.location)
        if lat is None or lng is None:
            continue
        features.append(GeoJSONFeature(
            geometry=GeoJSONGeometry(type="Point", coordinates=[lng, lat]),
            properties={
                "id": r.id,
                "type": r.type.value,
                "severity": r.severity.value,
                "status": r.status.value,
                "credibility_score": r.credibility_score,
                "headcount": r.headcount,
                "source": r.source.value,
            },
        ))
    return GeoJSONFeatureCollection(features=features)


@router.get("/heatmap", response_model=GeoJSONFeatureCollection)
def map_heatmap(
    limit: int = Query(1000, ge=1, le=5000),
    db: Session = Depends(get_db),
):
    """
    Severity-weighted points for MapLibre heatmap layer.
    Critical=1.0, Medium=0.6, Low=0.3.
    Frontend controls the color gradient.
    """
    rows = db.query(Request).limit(limit).all()
    features = []
    for r in rows:
        lat, lng = extract_lat_lng(r.location)
        if lat is None or lng is None:
            continue
        weight = SEVERITY_WEIGHT.get(r.severity, 0.3)
        features.append(GeoJSONFeature(
            geometry=GeoJSONGeometry(type="Point", coordinates=[lng, lat]),
            properties={
                "severity": r.severity.value,
                "weight": weight,
            },
        ))
    return GeoJSONFeatureCollection(features=features)


@router.get("/zones", response_model=GeoJSONFeatureCollection)
def map_zones(db: Session = Depends(get_db)):
    rows = db.query(DisasterZone).all()
    features = []
    for z in rows:
        try:
            shape = to_shape(z.boundary)
            # Polygon → list of rings; GeoJSON expects [lng, lat]
            if shape.geom_type == "Polygon":
                coords = [
                    [[c[0], c[1]] for c in shape.exterior.coords]
                ]
                for interior in shape.interiors:
                    coords.append([[c[0], c[1]] for c in interior.coords])
                geom_type = "Polygon"
            elif shape.geom_type == "MultiPolygon":
                coords = []
                for poly in shape.geoms:
                    ring = [[c[0], c[1]] for c in poly.exterior.coords]
                    coords.append([ring])
                geom_type = "MultiPolygon"
            else:
                continue
            features.append(GeoJSONFeature(
                geometry=GeoJSONGeometry(type=geom_type, coordinates=coords),
                properties={
                    "id": z.id,
                    "name": z.name,
                    "active": z.active,
                },
            ))
        except Exception:
            continue
    return GeoJSONFeatureCollection(features=features)


@router.get("/teams", response_model=GeoJSONFeatureCollection)
def map_teams(db: Session = Depends(get_db)):
    rows = db.query(Team).all()
    features = []
    for t in rows:
        lat, lng = extract_lat_lng(t.current_location)
        if lat is None or lng is None:
            continue
        features.append(GeoJSONFeature(
            geometry=GeoJSONGeometry(type="Point", coordinates=[lng, lat]),
            properties={
                "id": t.id,
                "name": t.name,
                "type": t.type,
                "org_name": t.org_name,
                "status": t.status.value,
            },
        ))
    return GeoJSONFeatureCollection(features=features)


@router.get("/facilities", response_model=GeoJSONFeatureCollection)
def map_facilities(
    type: Optional[str] = None,
    limit: int = Query(500, ge=1, le=2000),
    db: Session = Depends(get_db),
):
    q = db.query(Facility)
    if type:
        q = q.filter(Facility.type == type)
    rows = q.limit(limit).all()
    features = []
    for f in rows:
        lat, lng = extract_lat_lng(f.location)
        if lat is None or lng is None:
            continue
        features.append(GeoJSONFeature(
            geometry=GeoJSONGeometry(type="Point", coordinates=[lng, lat]),
            properties={
                "id": f.id,
                "name": f.name,
                "type": f.type.value,
                "address": f.address,
            },
        ))
    return GeoJSONFeatureCollection(features=features)
