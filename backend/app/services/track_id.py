"""Generate unique human-facing Track IDs: SAY-YYYY-XXXXXX"""
import secrets
import string
from datetime import datetime

from sqlalchemy.orm import Session

from app.models import Request

ALPHABET = string.ascii_uppercase + string.digits


def generate_track_id(db: Session, max_attempts: int = 12) -> str:
    year = datetime.utcnow().year
    for _ in range(max_attempts):
        suffix = "".join(secrets.choice(ALPHABET) for _ in range(6))
        track_id = f"SAY-{year}-{suffix}"
        exists = db.query(Request.id).filter(Request.track_id == track_id).first()
        if not exists:
            return track_id
    return f"SAY-{year}-{secrets.token_hex(4).upper()}"
