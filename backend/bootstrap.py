"""
Prepares the database before the API starts (used as part of the Render start command).
Safe to run on every boot:
  - enables PostGIS
  - creates missing tables and runs the idempotent migrations
  - seeds demo data ONLY when the database has no requests yet
    (seed.py wipes simulated data, so it must not run on every restart)
Run from backend/:
    python bootstrap.py
"""
from sqlalchemy import text

from app.database import Base, engine
from app import models  # noqa: F401 -- must import so models register with Base
from scripts import migrate_citizen_auth, migrate_ngo_coordination


def main():
    with engine.begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))
    print("PostGIS enabled.")

    Base.metadata.create_all(bind=engine)
    print("Tables ensured.")

    with engine.connect() as conn:
        is_empty = conn.execute(text("SELECT COUNT(*) FROM requests")).scalar() == 0

    migrate_citizen_auth.run()
    migrate_ngo_coordination.run()

    if is_empty:
        from seed import seed
        seed()
        print("Empty database: demo data seeded.")
    else:
        print("Existing data found: seeding skipped.")


if __name__ == "__main__":
    main()
