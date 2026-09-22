"""Facility schemas."""
from typing import Optional, List
from pydantic import BaseModel
from app.models import FacilityType


class FacilityOut(BaseModel):
    id: int
    name: str
    type: FacilityType
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    distance_meters: Optional[float] = None
    source_osm_id: Optional[str] = None

    class Config:
        from_attributes = True


class FacilitySyncResult(BaseModel):
    inserted: int
    updated: int
    total_fetched: int
    message: str = "Sync completed"


class SafeAreaOut(BaseModel):
    id: int
    name: str
    type: FacilityType
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    distance_meters: Optional[float] = None
    note: str = "Known nearby shelter/facility (OSM-derived, not an official safe zone declaration)"
