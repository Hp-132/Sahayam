"""
Nominatim geocoding helper for landmark → lat/lng resolution.
"""
import requests
from typing import Optional, Dict, Any

from app.config import NOMINATIM_BASE_URL, NOMINATIM_USER_AGENT


def geocode_landmark(landmark: str, timeout: int = 8) -> Optional[Dict[str, Any]]:
    """
    Resolve a free-text landmark to coordinates using Nominatim.
    Returns dict with latitude, longitude, display_name or None on failure.
    Does not raise — callers must handle None gracefully.
    """
    if not landmark or not landmark.strip():
        return None

    try:
        resp = requests.get(
            f"{NOMINATIM_BASE_URL}/search",
            params={
                "q": landmark.strip(),
                "format": "json",
                "limit": 1,
                "countrycodes": "in",
            },
            headers={"User-Agent": NOMINATIM_USER_AGENT},
            timeout=timeout,
        )
        resp.raise_for_status()
        data = resp.json()
        if not data:
            return None

        item = data[0]
        return {
            "latitude": float(item["lat"]),
            "longitude": float(item["lon"]),
            "display_name": item.get("display_name", landmark),
        }
    except Exception:
        return None
