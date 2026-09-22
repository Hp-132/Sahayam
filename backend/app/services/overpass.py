"""
Overpass API client — import real OSM hospitals / clinics / shelters / camps
into the local facilities table. Called by POST /api/facilities/sync.
"""
import requests
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session

from app.config import OVERPASS_BASE_URL, DEMO_BBOX
from app.models import Facility, FacilityType
from app.services.geo import make_point


# Map OSM amenity / social_facility tags → our FacilityType
TAG_MAP = {
    "hospital": FacilityType.HOSPITAL,
    "clinic": FacilityType.CLINIC,
    "doctors": FacilityType.CLINIC,
    "shelter": FacilityType.SHELTER,
    "social_facility": FacilityType.SHELTER,  # often used for shelters
    "refugee_site": FacilityType.CAMP,
    "camp_site": FacilityType.CAMP,
}


def _build_overpass_query(bbox: Dict[str, float]) -> str:
    """
    Overpass QL for amenities inside the demo bounding box.
    bbox = {south, west, north, east}
    """
    s, w, n, e = bbox["south"], bbox["west"], bbox["north"], bbox["east"]
    return f"""
    [out:json][timeout:60];
    (
      node["amenity"="hospital"]({s},{w},{n},{e});
      way["amenity"="hospital"]({s},{w},{n},{e});
      node["amenity"="clinic"]({s},{w},{n},{e});
      way["amenity"="clinic"]({s},{w},{n},{e});
      node["amenity"="doctors"]({s},{w},{n},{e});
      node["amenity"="social_facility"]({s},{w},{n},{e});
      way["amenity"="social_facility"]({s},{w},{n},{e});
      node["social_facility"="shelter"]({s},{w},{n},{e});
      node["amenity"="shelter"]({s},{w},{n},{e});
      node["tourism"="camp_site"]({s},{w},{n},{e});
    );
    out center tags;
    """


def fetch_osm_facilities(timeout: int = 90) -> List[Dict[str, Any]]:
    """
    Query Overpass and return a list of normalised facility dicts.
    Raises requests exceptions on network failure (caller should handle).
    """
    query = _build_overpass_query(DEMO_BBOX)
    resp = requests.post(
        f"{OVERPASS_BASE_URL}/interpreter",
        data={"data": query},
        timeout=timeout,
        headers={"User-Agent": "SahayamDisasterRelief/1.0"},
    )
    resp.raise_for_status()
    elements = resp.json().get("elements", [])

    results = []
    for el in elements:
        tags = el.get("tags") or {}
        amenity = tags.get("amenity") or tags.get("social_facility") or tags.get("tourism") or ""
        ftype = TAG_MAP.get(amenity)
        if not ftype:
            # social_facility with shelter subtype
            if tags.get("social_facility") in ("shelter", "group_home"):
                ftype = FacilityType.SHELTER
            else:
                continue

        # Coordinates: nodes have lat/lon; ways have center
        if "lat" in el and "lon" in el:
            lat, lon = float(el["lat"]), float(el["lon"])
        elif "center" in el:
            lat, lon = float(el["center"]["lat"]), float(el["center"]["lon"])
        else:
            continue

        name = tags.get("name") or tags.get("official_name") or f"Unnamed {ftype.value}"
        address_parts = [
            tags.get("addr:housenumber"),
            tags.get("addr:street"),
            tags.get("addr:city") or tags.get("addr:district"),
        ]
        address = ", ".join(p for p in address_parts if p) or None

        osm_id = f"{el.get('type', 'node')}/{el.get('id')}"

        results.append({
            "name": name[:255],
            "type": ftype,
            "address": address,
            "lat": lat,
            "lng": lon,
            "source_osm_id": osm_id,
        })
    return results


def sync_facilities(db: Session) -> Dict[str, int]:
    """
    Fetch from Overpass and upsert into facilities table by source_osm_id.
    Returns counts: inserted, updated, total_fetched.
    """
    fetched = fetch_osm_facilities()
    inserted = 0
    updated = 0

    for item in fetched:
        existing = (
            db.query(Facility)
            .filter(Facility.source_osm_id == item["source_osm_id"])
            .first()
        )
        if existing:
            existing.name = item["name"]
            existing.type = item["type"]
            existing.address = item["address"]
            existing.location = make_point(item["lat"], item["lng"])
            updated += 1
        else:
            fac = Facility(
                name=item["name"],
                type=item["type"],
                address=item["address"],
                location=make_point(item["lat"], item["lng"]),
                source_osm_id=item["source_osm_id"],
            )
            db.add(fac)
            inserted += 1

    db.commit()
    return {
        "inserted": inserted,
        "updated": updated,
        "total_fetched": len(fetched),
    }
