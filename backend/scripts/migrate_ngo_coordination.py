"""
Idempotent migration for NGO coordination (safe to re-run, never deletes data):
  - teamstatus enum: + UNAVAILABLE
  - teams.services, teams.capacity
  - requests.response_stage
  - tables ngo_accounts, request_assignments
  - demo logins + services for existing seeded teams
  - Ahmedabad-Gandhinagar demo NGO units (if missing)
  - history rows for requests that were assigned before this feature existed
  - team availability recomputed from workload
Run from backend/:
    python -m scripts.migrate_ngo_coordination
"""
from sqlalchemy import text

from app.database import engine, SessionLocal, Base
from app import models  # noqa: F401
from app.models import (
    Team, Request, RequestAssignment, RequestStatus, AssignmentStatus, AssignmentMode, ResponseStage,
)
from app.services.auth import hash_password
from app.services.demo_ngos import (
    ensure_demo_account, ensure_regional_units, REGIONAL_AREA, DEMO_NGO_PASSWORD,
)
from app.services.ngo_coordination import refresh_team_status


def run():
    # ALTER TYPE ... ADD VALUE must not run inside a transaction block that later uses it
    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
        conn.execute(text("ALTER TYPE teamstatus ADD VALUE IF NOT EXISTS 'UNAVAILABLE'"))

    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE teams ADD COLUMN IF NOT EXISTS services VARCHAR"))
        conn.execute(text("ALTER TABLE teams ADD COLUMN IF NOT EXISTS capacity INTEGER NOT NULL DEFAULT 3"))
        conn.execute(text("ALTER TABLE requests ADD COLUMN IF NOT EXISTS response_stage VARCHAR(24)"))
    Base.metadata.create_all(
        bind=engine,
        tables=[models.NgoAccount.__table__, models.RequestAssignment.__table__],
    )
    print("Schema ensured.")

    db = SessionLocal()
    try:
        pw = hash_password(DEMO_NGO_PASSWORD)
        teams = db.query(Team).all()
        created = 0
        for t in teams:
            if not t.account:
                ensure_demo_account(db, t, pw)
                created += 1
        regional = ensure_regional_units(db)
        for t in regional:
            ensure_demo_account(db, t, pw, operating_area=REGIONAL_AREA)
            created += 1
        teams += regional
        db.flush()

        backfilled = 0
        legacy = (
            db.query(Request)
            .filter(Request.assigned_team_id.isnot(None), ~Request.assignments.any())
            .all()
        )
        for r in legacy:
            resolved = r.status == RequestStatus.RESOLVED
            r.assignments.append(RequestAssignment(
                team_id=r.assigned_team_id,
                mode=AssignmentMode.DIRECT.value,
                status=(AssignmentStatus.COMPLETED if resolved else AssignmentStatus.ACCEPTED).value,
                created_at=r.updated_at or r.created_at,
                responded_at=r.updated_at or r.created_at,
            ))
            r.response_stage = (ResponseStage.COMPLETED if resolved else ResponseStage.ACCEPTED).value
            backfilled += 1
        db.flush()

        for t in teams:
            refresh_team_status(db, t)
        db.commit()
        print(f"Demo NGO logins created: {created} (password: {DEMO_NGO_PASSWORD})")
        print(f"Assignment history backfilled for {backfilled} request(s).")
        print("Team availability recomputed from workload.")
    finally:
        db.close()


if __name__ == "__main__":
    run()
