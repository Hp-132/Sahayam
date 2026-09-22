"""
Central configuration loaded from environment variables.
"""
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

NOMINATIM_BASE_URL = os.getenv("NOMINATIM_BASE_URL", "https://nominatim.openstreetmap.org")
NOMINATIM_USER_AGENT = os.getenv("NOMINATIM_USER_AGENT", "SahayamDisasterRelief/1.0 (college-project)")

OVERPASS_BASE_URL = os.getenv("OVERPASS_BASE_URL", "https://overpass-api.de/api")

# Demo bounding box roughly covering Gujarat / Maharashtra coastal demo region
# (west, south, east, north) — used for Overpass facility sync
DEMO_BBOX = {
    "south": 18.0,
    "west": 72.0,
    "north": 23.5,
    "east": 75.0,
}

# Duplicate detection thresholds
DUPLICATE_DISTANCE_METERS = 200          # geographic proximity
DUPLICATE_TEXT_SIMILARITY = 80           # RapidFuzz ratio threshold (0-100)

# Nearby facility / team search defaults
DEFAULT_NEARBY_RADIUS_METERS = 5000

# NGO coordination
# Normal (medium/low) requests: candidate NGOs searched within this radius, one is assigned
NGO_CANDIDATE_RADIUS_METERS = 150_000
# Critical requests: broadcast to every suitable NGO within this radius
# (widened once to the fallback radius if nobody suitable is inside it)
CRITICAL_BROADCAST_RADIUS_METERS = 75_000
CRITICAL_BROADCAST_FALLBACK_RADIUS_METERS = 120_000
CRITICAL_BROADCAST_MAX_NGOS = 8
# Shared password of the seeded demo NGO accounts (self-registered NGOs choose their own)
DEMO_NGO_PASSWORD = os.getenv("DEMO_NGO_PASSWORD", "ngo@2026")
