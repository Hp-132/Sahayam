"""Idempotent migration: citizens table + requests.track_id + requests.citizen_id"""
from sqlalchemy import text
from app.database import engine, SessionLocal
from app.models import Request
from app.services.track_id import generate_track_id


def run():
    with engine.connect() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS citizens (
                id SERIAL PRIMARY KEY,
                full_name VARCHAR NOT NULL,
                phone VARCHAR NOT NULL UNIQUE,
                email VARCHAR UNIQUE,
                password_hash VARCHAR NOT NULL,
                session_token VARCHAR UNIQUE,
                created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
            );
        """))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_citizens_phone ON citizens (phone);"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_citizens_email ON citizens (email);"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_citizens_session_token ON citizens (session_token);"))
        conn.execute(text("""
            DO $$ BEGIN
                ALTER TABLE requests ADD COLUMN track_id VARCHAR;
            EXCEPTION WHEN duplicate_column THEN NULL;
            END $$;
        """))
        conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_requests_track_id ON requests (track_id);"))
        conn.execute(text("""
            DO $$ BEGIN
                ALTER TABLE requests ADD COLUMN citizen_id INTEGER REFERENCES citizens(id);
            EXCEPTION WHEN duplicate_column THEN NULL;
            END $$;
        """))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_requests_citizen_id ON requests (citizen_id);"))
        conn.commit()
        print("Schema ensured.")

    db = SessionLocal()
    try:
        missing = db.query(Request).filter((Request.track_id == None) | (Request.track_id == "")).all()
        for req in missing:
            req.track_id = generate_track_id(db)
        db.commit()
        print(f"Backfilled track_id on {len(missing)} request(s).")
    finally:
        db.close()


if __name__ == "__main__":
    run()
