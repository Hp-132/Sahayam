"""
Run once to create all tables in the sahayam database:
    python db_setup.py
"""
from app.database import Base, engine
from app import models  # noqa: F401 -- must import so models register with Base

if __name__ == "__main__":
    Base.metadata.create_all(bind=engine)
    print("All 6 tables created: requests, facilities, teams, responders, verifications, disaster_zones")