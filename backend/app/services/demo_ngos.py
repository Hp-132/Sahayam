"""
Profiles + login accounts for the SIMULATED demo organisations created by
seed.py (and backfilled by scripts/migrate_ngo_coordination.py).
Self-registered NGOs never go through this module.
"""
import re
from typing import List, Optional

from sqlalchemy.orm import Session

from app.config import DEMO_NGO_PASSWORD
from app.models import NgoAccount, Team, TeamStatus
from app.services.geo import make_point
from app.services.ngo_coordination import primary_type  # noqa: F401  (re-exported for seed.py)

GOV = "Government / Statutory Agency"
NGO = "Registered NGO / Society"

# org_name -> (services, org_type, years_experience, team_size, capacity)
ORG_PROFILES = {
    "National Disaster Response Force": (["rescue", "evacuation", "medical"], GOV, 19, 45, 4),
    "Gujarat State Disaster Response Force": (["rescue", "evacuation"], GOV, 12, 35, 3),
    "Maharashtra State Disaster Response Force": (["rescue", "evacuation"], GOV, 10, 35, 3),
    "Kerala State Disaster Response Force": (["rescue", "evacuation"], GOV, 8, 30, 3),
    "Karnataka State Disaster Response Force": (["rescue", "evacuation"], GOV, 8, 30, 3),
    "Indian Red Cross Society": (["medical", "shelter", "food", "clothing", "supplies"], NGO, 100, 40, 3),
    "Goonj": (["clothing", "food", "supplies"], NGO, 26, 25, 2),
    "NDMA Aapda Mitra": (["rescue", "evacuation", "food"], "Community Volunteer Group", 8, 30, 2),
    "Surat Municipal Corporation": (["evacuation", "shelter", "fire", "food"], GOV, 30, 50, 3),
    "Doctors For You": (["medical", "supplies"], NGO, 18, 20, 2),
    "SEEDS India": (["shelter", "supplies"], NGO, 30, 18, 2),
    "Goa Fire and Emergency Services": (["fire", "rescue"], GOV, 40, 30, 3),
    "Kerala Fire and Rescue Services": (["fire", "rescue"], GOV, 60, 30, 3),
    "Rapid Response": (["food", "shelter", "supplies"], "Charitable Trust", 13, 20, 2),
    "CASA (Church's Auxiliary for Social Action)": (["food", "shelter", "clothing"], "Faith-based Organisation", 75, 25, 2),
    "Ahmedabad Municipal Corporation": (["fire", "rescue", "evacuation"], GOV, 60, 60, 3),
}

# Fixed-location units around Ahmedabad-Gandhinagar (inland, outside the coastal
# zones) so requests raised from the demo location have genuinely nearby NGOs.
REGIONAL_AREA = "Ahmedabad & Gandhinagar districts"
REGIONAL_UNITS = [
    ("Gujarat SDRF – Gandhinagar Unit", "Gujarat State Disaster Response Force", 23.2156, 72.6369),
    ("IRCS Ahmedabad District Branch", "Indian Red Cross Society", 23.0300, 72.5800),
    ("AMC Fire & Emergency Services – Ahmedabad", "Ahmedabad Municipal Corporation", 23.0225, 72.5714),
    ("Doctors For You – Ahmedabad Medical Team", "Doctors For You", 23.0700, 72.5200),
    ("Goonj – Ahmedabad Relief Centre", "Goonj", 23.0500, 72.6000),
    ("Aapda Mitra – Ahmedabad Volunteers", "NDMA Aapda Mitra", 23.1000, 72.5500),
]
DEFAULT_PROFILE = (["food", "shelter", "supplies"], NGO, 5, 15, 2)


def profile_for(org_name: Optional[str]):
    return ORG_PROFILES.get(org_name or "", DEFAULT_PROFILE)


def demo_email(team_name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", team_name.lower()).strip("-")
    return f"{slug}@ngo.sahayam.demo"


def ensure_demo_account(
    db: Session, team: Team, password_hash: str, operating_area: Optional[str] = None
) -> NgoAccount:
    """Attach services/capacity and a demo login to a seeded team (idempotent)."""
    services, org_type, years, team_size, capacity = profile_for(team.org_name)
    if not team.services:
        team.services = ",".join(services)
        team.capacity = capacity
    if team.account:
        return team.account
    acc = NgoAccount(
        team=team,
        org_type=org_type,
        contact_person=f"Duty Officer, {team.name}",
        phone=f"+91-90000{team.id:05d}",
        email=demo_email(team.name),
        registration_number=None,
        years_experience=years,
        operating_areas=operating_area or "Assigned disaster zone",
        headquarters=team.name,
        team_size=team_size,
        password_hash=password_hash,
        self_registered=False,
    )
    db.add(acc)
    return acc


def ensure_regional_units(db: Session) -> List[Team]:
    """Create any missing REGIONAL_UNITS teams (idempotent, matched by name)."""
    existing = {name for (name,) in db.query(Team.name).all()}
    created = []
    for name, org_name, lat, lng in REGIONAL_UNITS:
        if name in existing:
            continue
        services, _org_type, _years, _size, capacity = profile_for(org_name)
        team = Team(
            name=name,
            org_name=org_name,
            type=primary_type(services),
            current_location=make_point(lat, lng),
            status=TeamStatus.AVAILABLE,
            services=",".join(services),
            capacity=capacity,
        )
        db.add(team)
        created.append(team)
    db.flush()
    return created


__all__ = ["ORG_PROFILES", "REGIONAL_AREA", "ensure_regional_units", "profile_for", "primary_type", "demo_email", "ensure_demo_account", "DEMO_NGO_PASSWORD"]
