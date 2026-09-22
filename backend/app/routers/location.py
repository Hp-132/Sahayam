"""Location resolution endpoints."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.geocoding import geocode_landmark

router = APIRouter(prefix="/api/location", tags=["location"])


class LandmarkIn(BaseModel):
    landmark: str


class LandmarkOut(BaseModel):
    latitude: float
    longitude: float
    display_name: str


@router.post("/resolve", response_model=LandmarkOut)
def resolve_landmark(body: LandmarkIn):
    """Resolve a free-text landmark via Nominatim."""
    result = geocode_landmark(body.landmark)
    if not result:
        raise HTTPException(
            status_code=404,
            detail="Could not resolve landmark. Try a more specific name or use GPS.",
        )
    return LandmarkOut(
        latitude=result["latitude"],
        longitude=result["longitude"],
        display_name=result["display_name"],
    )
