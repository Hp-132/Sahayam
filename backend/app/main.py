"""
SAHAYAM FastAPI application entrypoint.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import (
    webhook,
    requests,
    teams,
    volunteers,
    admin,
    facilities,
    map,
    location,
    auth,
    ngo,
)
from app.routers.facilities import safe_router

app = FastAPI(
    title="SAHAYAM API",
    description="Disaster-relief coordination platform — college project",
    version="1.0.0",
)

# Allow local Next.js frontend during development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(webhook.router)
app.include_router(auth.router)
app.include_router(requests.router)
app.include_router(teams.router)
app.include_router(volunteers.router)
app.include_router(admin.router)
app.include_router(facilities.router)
app.include_router(safe_router)
app.include_router(map.router)
app.include_router(location.router)
app.include_router(ngo.router)


@app.get("/")
def root():
    return {
        "name": "SAHAYAM",
        "status": "ok",
        "docs": "/docs",
    }


@app.get("/health")
def health():
    return {"status": "healthy"}
