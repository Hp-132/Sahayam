"""
End-to-end smoke test of the NGO coordination flows (A-F) through the real API.

It creates citizens, requests and one NGO, so it only runs against a database
whose name ends in "_test" (seed it first):
    set DATABASE_URL=postgresql://postgres:<pw>@localhost:5432/sahayam_test
    python db_setup.py && python seed.py
    python -m scripts.smoke_ngo_flow
"""
import os
import time

from fastapi.testclient import TestClient

from app.config import DEMO_NGO_PASSWORD
from app.main import app

DB = os.getenv("DATABASE_URL", "")
assert DB.rstrip("/").endswith("_test"), "Refusing to run: DATABASE_URL must point at a *_test database"

c = TestClient(app)
SURAT = (21.1702, 72.8311)
RUN = str(int(time.time()))[-6:]


def ok(resp, code=200):
    assert resp.status_code == code, f"{resp.request.method} {resp.request.url} -> {resp.status_code} {resp.text}"
    return resp.json()


def citizen():
    body = {"full_name": "Smoke Citizen", "phone": f"98{RUN}{int(time.time() * 1000) % 100:02d}", "password": "secret123"}
    return {"Authorization": f"Bearer {ok(c.post('/api/auth/signup', json=body), 201)['token']}"}


def create(h, type_, lat=SURAT[0], lng=SURAT[1], **extra):
    body = {"type": type_, "headcount": 3, "latitude": lat, "longitude": lng, "location_source": "gps", **extra}
    return ok(c.post("/api/requests", json=body, headers=h), 201)


DEMO_EMAILS = {a["unit_name"]: a["email"] for a in ok(c.get("/api/ngo/demo-accounts"))["accounts"]}


def ngo_login(team_name, email=None, password=DEMO_NGO_PASSWORD):
    res = ok(c.post("/api/ngo/signin", json={"login": email or DEMO_EMAILS[team_name], "password": password}))
    return {"Authorization": f"Bearer {res['token']}"}, res["ngo"]


def pick(co):
    """Best-ranked alternative that has a demo login (self-registered NGOs kept across reseeds are skipped)."""
    return next(a for a in co["alternatives"] if a["team_name"] in DEMO_EMAILS)


def offer_for(ngo_h, request_id):
    rows = ok(c.get("/api/ngo/assignments", headers=ngo_h))
    return next((r for r in rows if r["request_id"] == request_id), None)


def track(h, rid):
    return ok(c.get(f"/api/requests/{rid}", headers=h))


def coord(rid):
    return ok(c.get(f"/api/admin/requests/{rid}/coordination"))


# ---------------------------------------------------------------- F. priority
pm = ok(c.get("/api/requests/priority-map"))
assert pm["MED"] == "C" and pm["FOOD"] == "M" and pm["OTHER"] == "L", pm
h = citizen()
r = create(h, "FOOD", severity="C")  # client tries to escalate -> ignored
assert r["severity"] == "M" and r["ngos_notified"] == 0, r
sms = ok(c.post("/webhook/sms", json={"message": f"DR1|FOOD|C|4|{SURAT[0]}|{SURAT[1]}"}))
assert sms["status"] == "accepted" and track({}, sms["request_id"])["severity"] == "M", sms
print("F  priority: backend mapping enforced for app + SMS (client/SMS severity ignored)")

# ---------------------------------------------------------------- A. normal
h = citizen()
r = create(h, "SHELTER")
rid = r["id"]
assert r["severity"] == "M" and r["ngos_notified"] == 0
t = track(h, rid)
assert t["display_status"] == "Pending" and not t["assigned_team"], t
co = coord(rid)
assert co["recommended"], co
rec = pick(co)
assert "shelter" in rec["services"], co
ok(c.patch(f"/api/admin/requests/{rid}/assign", json={"team_id": rec["team_id"]}))
t = track(h, rid)
assert t["display_status"] == "NGO Dispatched" and t["response_stage"] == "awaiting_response", t
assert t["responding_teams"] == [], "citizen must not see acceptance before NGO accepts"
ngo_h, prof = ngo_login(rec["team_name"])
off = offer_for(ngo_h, rid)
assert off and off["status"] == "offered" and off["mode"] == "direct", off
ok(c.post(f"/api/ngo/assignments/{off['id']}/accept", headers=ngo_h))
t = track(h, rid)
assert t["display_status"] == "NGO Accepted" and t["assigned_team"]["id"] == rec["team_id"], t
assert coord(rid)["current_assignment"]["status"] == "accepted"
ok(c.post(f"/api/ngo/assignments/{off['id']}/on-the-way", headers=ngo_h))
assert track(h, rid)["display_status"] == "NGO On the Way"
ok(c.post(f"/api/ngo/assignments/{off['id']}/complete", headers=ngo_h))
t = track(h, rid)
assert t["status"] == "resolved" and t["display_status"] == "Resolved", t
print(f"A  normal: assigned {rec['team_name']} -> accepted -> on the way -> resolved")

# ---------------------------------------------------------------- B. rejection
h = citizen()
rid = create(h, "SUPPLIES")["id"]
first = pick(coord(rid))
ok(c.patch(f"/api/admin/requests/{rid}/assign", json={"team_id": first["team_id"]}))
a_h, _ = ngo_login(first["team_name"])
off = offer_for(a_h, rid)
rej = ok(c.post(f"/api/ngo/assignments/{off['id']}/reject", json={"reason": "At full capacity"}, headers=a_h))
assert rej["status"] == "rejected" and rej["alternatives_found"] >= 1, rej
co = coord(rid)
assert co["request"]["response_stage"] == "rejected" and co["rejection_count"] == 1, co
assert co["history"][0]["rejection_reason"] == "At full capacity"
assert all(alt["team_id"] != first["team_id"] for alt in co["alternatives"]), "rejected NGO offered again"
t = track(h, rid)
assert t["display_status"] == "Reassignment Needed" and t["assigned_team"] is None, t
items = ok(c.get("/api/admin/requests", params={"limit": 1000}))
row = next(i for i in items if i["id"] == rid)
assert row["rejection_count"] == 1 and row["response_stage"] == "rejected", row
second = pick(co)
ok(c.patch(f"/api/admin/requests/{rid}/reassign", json={"team_id": second["team_id"]}))
b_h, _ = ngo_login(second["team_name"])
off_b = offer_for(b_h, rid)
assert off_b and off_b["status"] == "offered"
assert offer_for(a_h, rid)["status"] == "rejected", "NGO A keeps the rejected record"
ok(c.post(f"/api/ngo/assignments/{off_b['id']}/accept", headers=b_h))
t = track(h, rid)
assert t["display_status"] == "NGO Accepted" and t["assigned_team"]["id"] == second["team_id"], t
assert len(coord(rid)["history"]) == 2
print(f"B  rejection: {first['team_name']} rejected -> reassigned to {second['team_name']} -> accepted")

# ---------------------------------------------------------------- C. critical
h = citizen()
med = create(h, "MED", severity="L")  # citizen tries to downgrade -> still critical
assert med["severity"] == "C" and med["ngos_notified"] >= 1, med
teams = {t["id"]: t for t in ok(c.get("/api/teams"))}
assert all("medical" in teams[x["team_id"]]["services"] for x in coord(med["id"])["history"]), "incapable NGO"

r = create(h, "EVAC")
rid = r["id"]
assert r["severity"] == "C" and r["ngos_notified"] >= 2, r
co = coord(rid)
offers = [x for x in co["history"] if x["mode"] == "broadcast"]
assert len(offers) == r["ngos_notified"]
assert all(x["distance_meters"] <= 120_000 for x in offers), "broadcast reached a distant NGO"
assert all({"evacuation", "rescue"} & set(teams[x["team_id"]]["services"]) for x in offers), "incapable NGO"
far = {t["id"] for t in teams.values() if (t["latitude"] or 99) < 19.5}  # Konkan / Kerala units
assert not far & {x["team_id"] for x in offers}, "broadcast reached another state"
assert co["request"]["assigned_team_id"] is None
t = track(h, rid)
assert t["display_status"] == "NGO Dispatched" and t["notified_ngo_count"] == len(offers), t
sessions = [(ngo_login(x["team_name"])[0], x) for x in offers]
for s_h, x in sessions:
    assert offer_for(s_h, rid)["status"] == "offered", "every notified NGO sees the critical request"
ok(c.post(f"/api/ngo/assignments/{offer_for(sessions[0][0], rid)['id']}/reject",
          json={"reason": "Outside operating area"}, headers=sessions[0][0]))
assert track(h, rid)["display_status"] == "NGO Dispatched"
ok(c.post(f"/api/ngo/assignments/{offer_for(sessions[1][0], rid)['id']}/accept", headers=sessions[1][0]))
t = track(h, rid)
assert t["display_status"] == "NGO Accepted" and t["assigned_team"]["id"] == sessions[1][1]["team_id"], t
sms = ok(c.post("/webhook/sms", json={"payload": {"message": f"DR1|FIRE|L|2|{SURAT[0]}|{SURAT[1]}"}}))
assert sms["ngos_notified"] >= 1 and track({}, sms["request_id"])["severity"] == "C", sms
print(f"C  critical: MED/EVAC auto-critical; EVAC broadcast to {len(offers)} capable NGOs within "
      f"{max(x['distance_meters'] for x in offers) / 1000:.0f} km; 1 rejected, 1 accepted; SMS FIRE broadcast to {sms['ngos_notified']}")

# ---------------------------------------------------------------- D. medium/low
h = citizen()
for type_ in ("FOOD", "CLOTHES", "OTHER"):
    r = create(h, type_, other_description="Generator fuel" if type_ == "OTHER" else None)
    assert r["severity"] in ("M", "L") and r["ngos_notified"] == 0, r
    co = coord(r["id"])
    assert co["history"] == [], "medium/low must not be broadcast"
    if co["alternatives"]:
        ok(c.patch(f"/api/admin/requests/{r['id']}/assign", json={"team_id": pick(co)["team_id"]}))
        assert len(coord(r["id"])["history"]) == 1
print("D  medium/low: no broadcast; exactly one NGO offered on assignment")

# ---------------------------------------------------------------- E. registration
reg = {
    "org_name": f"Surat Relief Collective {RUN}", "org_type": "Charitable Trust",
    "contact_person": "Meera Shah", "phone": f"+91-97{RUN}11", "email": f"relief{RUN}@example.org",
    "registration_number": f"GJ/2019/{RUN}", "years_experience": 6,
    "operating_areas": "Surat, Navsari", "headquarters": "Adajan, Surat",
    "latitude": 21.19, "longitude": 72.80, "services": ["food", "shelter", "medical"],
    "team_size": 40, "capacity": 3, "password": "reliefpass1",
}
res = ok(c.post("/api/ngo/register", json=reg), 201)
assert res["ngo"]["self_registered"] and res["ngo"]["status"] == "available"
ok(c.post("/api/ngo/register", json=reg), 409)
ok(c.post("/api/ngo/register", json={**reg, "email": "x" + reg["email"], "phone": "+91-1", "services": ["lasers"]}), 422)
new_h, prof = ngo_login(None, email=reg["email"], password="reliefpass1")
listed = next((t for t in ok(c.get("/api/teams")) if t["id"] == prof["team_id"]), None)
assert listed and listed["self_registered"] and listed["profile"]["contact_person"] == "Meera Shah", listed
ok(c.patch("/api/ngo/me/availability", json={"available": False}, headers=new_h))
assert ok(c.get("/api/ngo/me", headers=new_h))["status"] == "unavailable"
rid = create(citizen(), "FOOD", lat=21.19, lng=72.80)["id"]
assert all(a["team_id"] != prof["team_id"] for a in coord(rid)["alternatives"]), "unavailable NGO suggested"
ok(c.patch("/api/ngo/me/availability", json={"available": True}, headers=new_h))
assert coord(rid)["recommended"]["team_id"] == prof["team_id"], "nearest registered NGO should be recommended"
ok(c.patch(f"/api/admin/requests/{rid}/assign", json={"team_id": prof["team_id"]}))
assert offer_for(new_h, rid)["status"] == "offered"
ok(c.get("/api/ngo/me"), 401)
print(f"E  registration: '{reg['org_name']}' registered, signed in, listed for admin, received an assignment")

# ---------------------------------------------------------------- demo location (Ahmedabad)
AMD = (23.128, 72.542)
h = citizen()
r = create(h, "MED", lat=AMD[0], lng=AMD[1])
offers = [x for x in coord(r["id"])["history"] if x["mode"] == "broadcast"]
assert r["severity"] == "C" and len(offers) >= 2 and all(x["distance_meters"] <= 75_000 for x in offers), offers
r = create(h, "FOOD", lat=AMD[0], lng=AMD[1])
rec = coord(r["id"])["recommended"]
assert r["ngos_notified"] == 0 and rec and rec["distance_meters"] < 30_000, rec
print(f"AMD demo location: MED alerts {len(offers)} local NGOs; FOOD recommends {rec['team_name']} ({rec['distance_meters'] / 1000:.0f} km)")

# ---------------------------------------------------------------- existing endpoints still fine
for path in ("/api/admin/dashboard", "/api/map/teams", "/api/map/requests", "/api/map/heatmap",
             "/api/admin/requests", "/api/requests", "/health"):
    ok(c.get(path))
rid = create(citizen(), "SHELTER")["id"]
ok(c.patch(f"/api/admin/requests/{rid}/resolve"))
print("OK existing admin/map/request endpoints respond; admin resolve works")
print("\nALL NGO COORDINATION SMOKE CHECKS PASSED")
