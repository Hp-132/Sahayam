# simulated data ONLY: fake requests, fake teams, 4 disaster_zone polygons for
# the "Arabian Sea Cyclone -- Multi-State Coastal Emergency" demo scenario.

"""
Populates SIMULATED demo data: teams (NGOs + demo logins), responders,
requests (+ NGO assignment history), 4 disaster zones.
Does NOT touch `facilities` -- those are real data, fetched separately via
scripts/fetch_facilities.py (Overpass API).
Idempotent: on every run this clears out ONLY the previously-seeded
SIMULATED tables (verifications, request_assignments, requests, responders,
seeded teams + their demo NGO logins, disaster_zones) and reseeds the upgraded dataset. It never drops the
database, PostGIS extension, or any table -- rows are DELETEd, not the
schema. Organisations that self-registered through the NGO portal are kept.
Run:
    python seed.py
"""
import random
from datetime import datetime, timedelta
from sqlalchemy import text
from geoalchemy2.elements import WKTElement
from app.database import SessionLocal
from app.models import (
    Request, RequestType, Severity, RequestStatus, LocationSource, RequestSource,
    Team, TeamStatus, Responder, ResponderRole, DisasterZone,
    RequestAssignment, AssignmentStatus, AssignmentMode, ResponseStage,
)
from app.services.track_id import generate_track_id
from app.services.auth import hash_password
from app.services.priority import priority_for_type
from app.services.demo_ngos import (
    profile_for, primary_type, ensure_demo_account, ensure_regional_units, REGIONAL_AREA, DEMO_NGO_PASSWORD,
)
from app.services.ngo_coordination import is_capable, refresh_team_status
random.seed(42)  # reproducible demo data across reseeds
# ---------------------------------------------------------------------------
# ZONE DEFINITIONS -- synthetic demo polygons only, NOT official hazard maps
# ---------------------------------------------------------------------------
# Each zone is a simple rectangular bounding box (lat/lng). These are
# illustrative cyclone-impact areas for a college prototype, not real
# government-issued geofences.
ZONES = [
    {
        "name": "Saurashtra-Diu Coastal Emergency Zone",
        "lat_min": 20.60, "lat_max": 22.50,
        "lng_min": 68.90, "lng_max": 71.80,
        "hotspots": [(21.64, 69.61), (20.71, 70.98), (22.24, 68.97)],
        "landmarks": [
            "Porbandar fishing harbour", "Diu jetty", "Dwarka bus stand",
            "Veraval fish market", "Mangrol coastal road",
        ],
        "type_weights": {
            "SAR": 0.22, "MED": 0.20, "EVAC": 0.20, "MISSING": 0.15,
            "SHELTER": 0.08, "FOOD": 0.05, "SUPPLIES": 0.04,
            "CLOTHES": 0.03, "FIRE": 0.02, "OTHER": 0.01,
        },
        "request_count": 60,
        "team_count": 7,
    },
    {
        "name": "South Gujarat Coastal Emergency Zone",
        "lat_min": 20.00, "lat_max": 21.60,
        "lng_min": 72.60, "lng_max": 73.30,
        "hotspots": [(21.17, 72.83), (20.60, 72.93)],
        "landmarks": [
            "Surat riverside colony", "Valsad railway crossing",
            "Navsari main road", "Bilimora ferry point",
        ],
        "type_weights": {
            "EVAC": 0.25, "MED": 0.18, "SHELTER": 0.18, "FOOD": 0.15,
            "SUPPLIES": 0.10, "CLOTHES": 0.05, "SAR": 0.05,
            "MISSING": 0.02, "FIRE": 0.01, "OTHER": 0.01,
        },
        "request_count": 55,
        "team_count": 6,
    },
    {
        "name": "Konkan Coastal Emergency Zone",
        "lat_min": 15.30, "lat_max": 19.50,
        "lng_min": 72.60, "lng_max": 73.80,
        "hotspots": [(18.94, 72.83), (16.70, 73.30), (15.50, 73.80)],
        "landmarks": [
            "Alibaug pier", "Ratnagiri fish market", "Panaji riverfront",
            "Chiplun highway bridge",
        ],
        "type_weights": {
            "EVAC": 0.25, "SAR": 0.20, "MISSING": 0.18, "MED": 0.17,
            "SHELTER": 0.08, "FOOD": 0.05, "SUPPLIES": 0.03,
            "CLOTHES": 0.02, "FIRE": 0.01, "OTHER": 0.01,
        },
        "request_count": 55,
        "team_count": 6,
    },
    {
        "name": "Southwest Coastal Emergency Zone",
        "lat_min": 8.00, "lat_max": 14.50,
        "lng_min": 74.60, "lng_max": 77.00,
        "hotspots": [(12.91, 74.85), (9.93, 76.26), (8.52, 76.94)],
        "landmarks": [
            "Mangalore port road", "Udupi bus stand", "Kochi backwater jetty",
            "Kozhikode beach road", "Trivandrum coastal colony",
        ],
        "type_weights": {
            "EVAC": 0.22, "MED": 0.20, "SHELTER": 0.18, "FOOD": 0.15,
            "SAR": 0.12, "SUPPLIES": 0.06, "MISSING": 0.03,
            "CLOTHES": 0.02, "FIRE": 0.01, "OTHER": 0.01,
        },
        "request_count": 40,
        "team_count": 6,
    },
]
TEAM_CITY_PINS = [
    # Saurashtra-Diu
    [(21.6417, 69.6293),  # Porbandar
     (20.9042, 70.3679),  # Veraval
     (20.7141, 70.9878),  # Diu
     (22.2442, 68.9685),  # Dwarka
     (21.5222, 70.4579),  # Junagadh
     (21.5200, 70.1200)], # Mangrol
    # South Gujarat
    [(21.1702, 72.8311),  # Surat
     (20.5992, 72.9342),  # Valsad
     (20.9517, 72.9520),  # Navsari
     (21.3973, 72.8499)], # Bilimora
    # Konkan
    [(19.0760, 72.8777),  # Mumbai
     (18.6414, 72.8722),  # Alibaug
     (16.9902, 73.3120),  # Ratnagiri
     (17.5333, 73.5167),  # Chiplun
     (15.4909, 73.8278)], # Panaji
    # Southwest
    [(12.9141, 74.8560),  # Mangaluru
     (13.3409, 74.7421),  # Udupi
     (11.2588, 75.7804),  # Kozhikode
     (9.9312, 76.2673),   # Kochi
     (8.5241, 76.9366)],  # Thiruvananthapuram
]
OUTSIDE_ZONE_COUNT = 10
# inland box, clear of all 4 coastal zones above
OUTSIDE_BOX = {"lat_min": 18.0, "lat_max": 21.0, "lng_min": 76.5, "lng_max": 79.0}
OUTSIDE_TYPE_WEIGHTS = {
    "SAR": 0.10, "MED": 0.15, "FIRE": 0.05, "MISSING": 0.10, "EVAC": 0.15,
    "SHELTER": 0.10, "FOOD": 0.10, "CLOTHES": 0.10, "SUPPLIES": 0.10, "OTHER": 0.05,
}
STATUS_WEIGHTS = {
    RequestStatus.PENDING: 0.35,
    RequestStatus.VERIFIED: 0.25,
    RequestStatus.DISPATCHED: 0.20,
    RequestStatus.RESOLVED: 0.20,
}
# Simulated roster using real Indian disaster-response organisations.
# Not a live official deployment list. Ordered to follow ZONES:
# Saurashtra-Diu (7), South Gujarat (6), Konkan (6), Southwest (6).
# Each entry is (team display name, parent organisation).
TEAM_UNITS = [
    # Saurashtra-Diu Coastal Emergency Zone
    ("NDRF 6th Bn (Vadodara) – Team 1", "National Disaster Response Force"),
    ("NDRF 6th Bn (Vadodara) – Team 2", "National Disaster Response Force"),
    ("Gujarat SDRF – Porbandar Unit", "Gujarat State Disaster Response Force"),
    ("Gujarat SDRF – Junagadh Unit", "Gujarat State Disaster Response Force"),
    ("IRCS Gujarat – Coastal Relief Team", "Indian Red Cross Society"),
    ("Goonj – Saurashtra Relief Unit", "Goonj"),
    ("Aapda Mitra – Gir-Somnath Volunteers", "NDMA Aapda Mitra"),
    # South Gujarat Coastal Emergency Zone
    ("NDRF 6th Bn (Vadodara) – Team 3", "National Disaster Response Force"),
    ("Gujarat SDRF – Surat Unit", "Gujarat State Disaster Response Force"),
    ("SMC Disaster Cell – Surat", "Surat Municipal Corporation"),
    ("IRCS Surat District Branch", "Indian Red Cross Society"),
    ("Doctors For You – South Gujarat Medical Team", "Doctors For You"),
    ("SEEDS India – Navsari Field Unit", "SEEDS India"),
    # Konkan Coastal Emergency Zone
    ("NDRF 5th Bn (Pune) – Team 1", "National Disaster Response Force"),
    ("NDRF 5th Bn (Pune) – Team 2", "National Disaster Response Force"),
    ("Maharashtra SDRF – Raigad Unit", "Maharashtra State Disaster Response Force"),
    ("Maharashtra SDRF – Ratnagiri Unit", "Maharashtra State Disaster Response Force"),
    ("Goa Fire & Emergency – Coastal Rescue", "Goa Fire and Emergency Services"),
    ("Rapid Response – Konkan Relief Unit", "Rapid Response"),
    # Southwest Coastal Emergency Zone
    ("NDRF 4th Bn (Arakkonam) – Team 1", "National Disaster Response Force"),
    ("Kerala SDRF – Ernakulam Unit", "Kerala State Disaster Response Force"),
    ("Kerala Fire & Rescue – Coastal Station", "Kerala Fire and Rescue Services"),
    ("Karnataka SDRF – Mangaluru Unit", "Karnataka State Disaster Response Force"),
    ("IRCS Kerala – State Relief Team", "Indian Red Cross Society"),
    ("CASA – Southwest Coast Relief", "CASA (Church's Auxiliary for Social Action)"),
]
# Demo organisations that start the scenario as Unavailable (stood down / off duty)
UNAVAILABLE_UNITS = {
    "SEEDS India – Navsari Field Unit",
    "Kerala Fire & Rescue – Coastal Station",
}
FIRST_NAMES = [
    "Raj", "Priya", "Amit", "Sneha", "Vikram", "Anjali", "Karan", "Neha",
    "Rohan", "Divya", "Aditi", "Manish", "Pooja", "Suresh", "Kavita",
    "Nikhil", "Meera", "Arjun", "Ritu", "Sanjay",
    "Jignesh", "Bhavna", "Hardik", "Hetal", "Dinesh", "Savita", "Nilesh",
    "Asha", "Sachin", "Vaishali", "Manoj", "Deepa", "Harish", "Lakshmi",
    "Ramesh", "Anitha", "Yusuf", "Fatima", "Venkat", "Sowmya", "Rahul",
    "Shruti", "Abdul", "Amina", "George", "Mary", "Prakash", "Sunita",
    "Kishore", "Rekha", "Ajay", "Pallavi", "Naveen", "Kavya", "Farhan",
    "Isha", "Dev", "Ananya", "Harsh", "Nandini",
]
LAST_NAMES = [
    "Patel", "Shah", "Kumar", "Desai", "Singh", "Mehta", "Joshi", "Trivedi",
    "Vyas", "Rana", "Nair", "Menon", "Pillai", "Naik", "Kulkarni",
    "Solanki", "Jadeja", "Chavda", "Sharma", "Iyer", "Shetty", "Hegde",
    "Kamath", "Gowda", "Nambiar", "Kurup", "Warrier", "Fernandes",
    "Pereira", "DSouza", "Khan", "Sheikh", "Reddy", "Rao", "Das",
    "Banerjee", "Mishra", "Gupta", "Jadhav", "Sawant", "Gaikwad",
    "Kamble", "Chacko", "Thomas", "Mathew", "Rodrigues",
]
# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
def to_geography_point(lat, lng):
    return WKTElement(f"POINT({lng} {lat})", srid=4326)
def weighted_type(weights: dict) -> RequestType:
    names = list(weights.keys())
    w = list(weights.values())
    return RequestType[random.choices(names, weights=w)[0]]
def weighted_status() -> RequestStatus:
    names = list(STATUS_WEIGHTS.keys())
    w = list(STATUS_WEIGHTS.values())
    return random.choices(names, weights=w)[0]
def random_point_in_box(box):
    lat = random.uniform(box["lat_min"], box["lat_max"])
    lng = random.uniform(box["lng_min"], box["lng_max"])
    return lat, lng
def random_point_near(lat, lng, spread=0.04):
    return lat + random.uniform(-spread, spread), lng + random.uniform(-spread, spread)
def build_raw_sms(req_type: RequestType, severity: Severity, headcount: int, lat: float, lng: float) -> str:
    # Mirrors exactly what the Android SMS Gateway forwards to POST /webhook/sms.
    # sms_parser.py only ever accepts messages starting with "DR1|" -- everything
    # else is dropped before it reaches the DB, so every SMS-sourced record here
    # stores raw_sms in that same DR1 pipe-delimited format for realism/testing.
    return f"DR1|{req_type.name}|{severity.name}|{headcount}|{lat:.4f}|{lng:.4f}"
def make_request(req_type, severity, lat, lng, landmark_pool):
    status = weighted_status()
    headcount = random.randint(1, 12)
    source = random.choices([RequestSource.APP, RequestSource.SMS], weights=[0.75, 0.25])[0]
    location_source = random.choices([LocationSource.GPS, LocationSource.LANDMARK], weights=[0.7, 0.3])[0]
    landmark_text = None
    if location_source == LocationSource.LANDMARK:
        landmark_text = random.choice(landmark_pool) if landmark_pool else "Unnamed local landmark"
    credibility = random.randint(40, 100) if status != RequestStatus.PENDING else random.randint(40, 75)
    report_count = random.randint(1, 5)
    raw_sms = None
    if source == RequestSource.SMS:
        raw_sms = build_raw_sms(req_type, severity, headcount, lat, lng)
    now = datetime.utcnow()
    created_at = now - timedelta(minutes=random.randint(0, 4000))  # spread over ~2.7 days
    return dict(
        type=req_type,
        other_description="Generator and fuel needed" if req_type == RequestType.OTHER else None,
        severity=severity,
        headcount=headcount,
        location=to_geography_point(lat, lng),
        location_source=location_source,
        landmark_text=landmark_text,
        status=status,
        credibility_score=credibility,
        report_count=report_count,
        source=source,
        raw_sms=raw_sms,
        created_at=created_at,
        updated_at=now,
    )
# ---------------------------------------------------------------------------
# main seed routine
# ---------------------------------------------------------------------------
def clear_simulated_data(db):
    """
    Removes ONLY the simulated demo tables, in FK-safe order (verifications
    and requests reference teams/responders, so they go first). Never
    touches `facilities` (real Overpass data) and never drops the database,
    PostGIS, or any table -- rows only.
    """
    before = {}
    for tbl in ("requests", "request_assignments", "responders", "teams", "ngo_accounts",
                "disaster_zones", "verifications"):
        before[tbl] = db.execute(text(f"SELECT COUNT(*) FROM {tbl}")).scalar()
    print("Existing simulated data found:", before)
    db.execute(text("DELETE FROM verifications"))
    db.execute(text("DELETE FROM request_assignments"))
    db.execute(text("DELETE FROM requests"))
    db.execute(text("DELETE FROM responders"))
    # keep organisations that registered themselves through the NGO portal
    db.execute(text("DELETE FROM ngo_accounts WHERE self_registered = false"))
    db.execute(text(
        "DELETE FROM teams WHERE id NOT IN (SELECT team_id FROM ngo_accounts WHERE self_registered = true)"
    ))
    db.execute(text("DELETE FROM disaster_zones"))
    db.commit()
    print("Cleared previous simulated seed data (facilities + self-registered NGOs untouched).\n")
def seed():
    db = SessionLocal()
    try:
        clear_simulated_data(db)
        # ---------- disaster_zones ----------
        zone_records = []
        for zone in ZONES:
            polygon = WKTElement(
                f"POLYGON(("
                f"{zone['lng_min']} {zone['lat_min']}, "
                f"{zone['lng_max']} {zone['lat_min']}, "
                f"{zone['lng_max']} {zone['lat_max']}, "
                f"{zone['lng_min']} {zone['lat_max']}, "
                f"{zone['lng_min']} {zone['lat_min']}"
                f"))",
                srid=4326,
            )
            record = DisasterZone(name=zone["name"], boundary=polygon, active=True)
            db.add(record)
            zone_records.append(record)
        db.flush()
        # ---------- teams (25 total, distributed across the 4 zones) ----------
        teams_by_zone = {i: [] for i in range(len(ZONES))}
        team_zone = {}  # unit name -> zone name, for the demo login profile
        all_teams = []
        name_idx = 0
        for zi, zone in enumerate(ZONES):
            for _ in range(zone["team_count"]):
                city_pins = TEAM_CITY_PINS[zi]
                base_lat, base_lng = random.choice(city_pins)
                lat, lng = random_point_near(base_lat, base_lng, spread=0.03)
                unit_name, org_name = TEAM_UNITS[name_idx % len(TEAM_UNITS)]
                services, _org_type, _years, _size, capacity = profile_for(org_name)
                team = Team(
                    name=unit_name,
                    type=primary_type(services),
                    org_name=org_name,
                    current_location=to_geography_point(lat, lng),
                    status=TeamStatus.UNAVAILABLE if unit_name in UNAVAILABLE_UNITS else TeamStatus.AVAILABLE,
                    services=",".join(services),
                    capacity=capacity,
                )
                team_zone[unit_name] = zone["name"]
                name_idx += 1
                db.add(team)
                teams_by_zone[zi].append(team)
                all_teams.append(team)
        db.flush()  # need team IDs before assigning responders / requests
        # fixed Ahmedabad-Gandhinagar units (inland demo location, no zone requests)
        regional_teams = ensure_regional_units(db)
        for team in regional_teams:
            team_zone[team.name] = REGIONAL_AREA
        all_teams.extend(regional_teams)
        # ---------- demo NGO logins (one per seeded organisation unit) ----------
        demo_pw_hash = hash_password(DEMO_NGO_PASSWORD)
        for team in all_teams:
            ensure_demo_account(db, team, demo_pw_hash, operating_area=team_zone.get(team.name))
        db.flush()
        # ---------- responders (12 admin verifier records for Verification model) ----------
        responders = []
        for i in range(12):
            name = f"Admin Verifier - {random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}"
            responder = Responder(name=name, role=ResponderRole.ADMIN, team_id=None)
            db.add(responder)
            responders.append(responder)
        db.flush()
        # ---------- requests ----------
        all_requests_meta = []  # (record, zone_index_or_None) for stats + team assignment
        for zi, zone in enumerate(ZONES):
            for _ in range(zone["request_count"]):
                req_type = weighted_type(zone["type_weights"])
                severity = priority_for_type(req_type)
                if severity == Severity.C:
                    # critical requests cluster around a handful of hotspots
                    hlat, hlng = random.choice(zone["hotspots"])
                    lat, lng = random_point_near(hlat, hlng, spread=0.04)
                elif severity == Severity.M:
                    # medium requests spread across the whole zone
                    lat, lng = random_point_in_box(zone)
                else:
                    # low severity: scattered, slightly wider than the zone box
                    pad = 0.05
                    wide_box = {
                        "lat_min": zone["lat_min"] - pad, "lat_max": zone["lat_max"] + pad,
                        "lng_min": zone["lng_min"] - pad, "lng_max": zone["lng_max"] + pad,
                    }
                    lat, lng = random_point_in_box(wide_box)
                data = make_request(req_type, severity, lat, lng, zone["landmarks"])
                record = Request(**data)
                db.add(record)
                all_requests_meta.append((record, zi))
        for _ in range(OUTSIDE_ZONE_COUNT):
            req_type = weighted_type(OUTSIDE_TYPE_WEIGHTS)
            severity = priority_for_type(req_type)
            lat, lng = random_point_in_box(OUTSIDE_BOX)
            data = make_request(req_type, severity, lat, lng, [])
            record = Request(**data)
            db.add(record)
            all_requests_meta.append((record, None))
        db.flush()  # assign IDs before we start referencing team ids below
        for record, _zi in all_requests_meta:
            if not record.track_id:
                record.track_id = generate_track_id(db)
        db.flush()
        # ---------- assign NGOs to some dispatched/resolved requests ----------
        # Each assignment gets an accepted / on-the-way / completed history row;
        # team Available/Busy is then derived from workload vs capacity.
        assigned_count = 0
        for record, zi in all_requests_meta:
            if record.status in (RequestStatus.DISPATCHED, RequestStatus.RESOLVED):
                if random.random() < 0.7:  # do not assign every eligible request
                    pool = teams_by_zone[zi] if zi is not None and teams_by_zone[zi] else all_teams
                    pool = [t for t in pool if t.status != TeamStatus.UNAVAILABLE] or pool
                    capable = [t for t in pool if is_capable(t, record.type)] or pool
                    chosen_team = random.choice(capable)
                    record.assigned_team_id = chosen_team.id
                    if record.status == RequestStatus.RESOLVED:
                        a_status, stage = AssignmentStatus.COMPLETED, ResponseStage.COMPLETED
                    elif random.random() < 0.5:
                        a_status, stage = AssignmentStatus.ON_THE_WAY, ResponseStage.ON_THE_WAY
                    else:
                        a_status, stage = AssignmentStatus.ACCEPTED, ResponseStage.ACCEPTED
                    record.response_stage = stage.value
                    record.assignments.append(RequestAssignment(
                        team_id=chosen_team.id,
                        mode=AssignmentMode.DIRECT.value,
                        status=a_status.value,
                        created_at=record.created_at,
                        responded_at=record.created_at + timedelta(minutes=random.randint(3, 40)),
                    ))
                    assigned_count += 1
                else:
                    # dispatched without an NGO on record is not a real state any more
                    if record.status == RequestStatus.DISPATCHED:
                        record.status = RequestStatus.VERIFIED
        db.flush()
        for team in db.query(Team).all():
            refresh_team_status(db, team)
        db.commit()
        # -------------------------------------------------------------
        # report
        # -------------------------------------------------------------
        total_requests = len(all_requests_meta)
        zone_dist = {ZONES[zi]["name"]: 0 for zi in range(len(ZONES))}
        zone_dist["Outside zones"] = 0
        severity_dist = {"C": 0, "M": 0, "L": 0}
        type_dist = {}
        status_dist = {}
        source_dist = {"APP": 0, "SMS": 0}
        inside_count = 0
        outside_count = 0
        for record, zi in all_requests_meta:
            if zi is None:
                zone_dist["Outside zones"] += 1
                outside_count += 1
            else:
                zone_dist[ZONES[zi]["name"]] += 1
                inside_count += 1
            severity_dist[record.severity.name] += 1
            type_dist[record.type.name] = type_dist.get(record.type.name, 0) + 1
            status_dist[record.status.name] = status_dist.get(record.status.name, 0) + 1
            source_dist[record.source.name] += 1
        print("===== SEED SUMMARY =====")
        print(f"Teams: {len(all_teams)}")
        team_status_dist = {}
        for team in all_teams:
            team_status_dist[team.status.name] = team_status_dist.get(team.status.name, 0) + 1
        print("Team availability:", team_status_dist)
        print(f"Demo NGO logins: {len(all_teams)}  (email = <unit-slug>@ngo.sahayam.demo, password = {DEMO_NGO_PASSWORD})")
        print(f"Responders: {len(responders)}")
        print(f"Disaster zones: {len(zone_records)}")
        print(f"Total requests: {total_requests}")
        print(f"Requests assigned to a team: {assigned_count}")
        print("\nRequest distribution by zone:")
        for name, count in zone_dist.items():
            print(f"  {name}: {count}")
        print("\nSeverity distribution:", severity_dist)
        print("Type distribution:", type_dist)
        print("Status distribution:", status_dist)
        print("Source distribution (APP vs SMS):", source_dist)
        print(f"Inside disaster zones: {inside_count}  |  Outside disaster zones: {outside_count}")
        print("=========================\n")
    except Exception as e:
        db.rollback()
        print("Seed failed:", e)
        raise
    finally:
        db.close()
if __name__ == "__main__":
    seed()