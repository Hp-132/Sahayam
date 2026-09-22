# Sahayam

**Getting help to people in disasters faster, even when the internet is down.**

When a flood, cyclone or earthquake hits, help usually exists. The problem is getting it to the right place. Calls for help are scattered across phone calls, social media and word of mouth. The same emergency is reported ten times while another goes unheard. Relief organisations work without seeing what the others are doing, and the people who need help most are often the ones without a working internet connection.

**Sahayam** connects citizens in distress, relief organisations and coordinators on one platform. Every request is captured, prioritised, sent to the right responder and tracked until it is resolved.

---

## ✨ Key Features

**🆘 Request help in seconds**
A guided emergency flow built for stressful moments. Every request gets a tracking ID so citizens can follow its progress live.

**📶 Works offline and over SMS**
Sahayam is an installable web app that keeps working without a connection. When there is no internet at all, requests can still be sent as a plain SMS and are picked up by the system automatically.

**🧠 Smart triage**
Requests are scored automatically by urgency and credibility, so the most critical cases rise to the top instead of waiting in a queue.

**🔁 Duplicate detection**
Several reports of the same incident are recognised and grouped, so responders aren't sent twice to one place while other people wait.

**🤝 NGO coordination**
Each request is matched to the nearest suitable relief organisation. Critical emergencies are broadcast to several nearby responders at once.

**🗺️ Nearby help on a live map**
Citizens can find the closest hospitals, shelters and relief points on an interactive map built on OpenStreetMap data.

**📊 Command dashboard for coordinators**
Admins verify requests, manage organisations and follow the whole relief operation through live analytics.

---

## 👥 Built for three kinds of users

| Citizens | Relief organisations | Coordinators |
|---|---|---|
| Report emergencies, track requests, find nearby help and helplines | Receive assigned requests, respond and update status | Verify, prioritise, oversee organisations and analyse the response |

---

## 🛠️ Tech Stack

**Frontend:** React · TypeScript · Vite · MapLibre (installable offline web app)
**Backend:** Python · FastAPI
**Data:** PostgreSQL + PostGIS for location queries · OpenStreetMap

---

## 🚀 Getting Started

```bash
# Backend
cd backend
cp .env.example .env        # fill in your own values
pip install -r requirements.txt
uvicorn app.main:app --reload

# Frontend
cd frontend
cp .env.example .env
npm install
npm run dev
```

---

<p align="center"><i>Sahayam (सहायम्): "help" in Sanskrit.</i></p>
