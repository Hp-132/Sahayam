"""
Single source of truth for request priority (severity).

Citizens do not choose priority: it is derived from the request type here,
for app submissions, the SMS webhook and seed data alike.
"""
from app.models import RequestType, Severity

PRIORITY_BY_TYPE = {
    # Immediate threat to life
    RequestType.MED: Severity.C,
    RequestType.SAR: Severity.C,
    RequestType.FIRE: Severity.C,
    RequestType.MISSING: Severity.C,
    RequestType.EVAC: Severity.C,
    # Urgent relief needs
    RequestType.FOOD: Severity.M,
    RequestType.CLOTHES: Severity.M,
    RequestType.SUPPLIES: Severity.M,
    RequestType.SHELTER: Severity.M,
    # Non-urgent / unclassified
    RequestType.OTHER: Severity.L,
}


def priority_for_type(req_type) -> Severity:
    return PRIORITY_BY_TYPE.get(RequestType(req_type), Severity.L)


def priority_map() -> dict:
    """{type_code: severity_code} for clients (the frontend caches it for offline DR1 SMS)."""
    return {t.value: s.value for t, s in PRIORITY_BY_TYPE.items()}
