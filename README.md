# Sahayam

<p align="center">
  <strong>Right Help. Right Place. Right Time.</strong>
</p>

<p align="center">
  A disaster-relief coordination platform connecting citizens, coordinators,
  and relief organisations to deliver timely, location-aware assistance.
</p>



---

## Overview

During disasters, the challenge is often not the absence of help — it is **coordinating the right response at the right place and time**.

Emergency reports can arrive through multiple channels, duplicate incidents can overwhelm responders, and citizens may have limited connectivity precisely when they need assistance most.

**Sahayam** provides a unified platform for collecting, verifying, coordinating, and tracking disaster-relief requests.

The system connects:

**Citizen → Coordinator → Relief Organisation → Citizen**

It combines **geospatial matching, duplicate detection, priority classification, NGO coordination, interactive maps, and offline/SMS fallback** into a single response workflow.

---

## 🚨 Key Features

### 🆘 Emergency Reporting

* Guided emergency request submission
* Automatic priority classification based on emergency type
* Location-based request processing
* Tracking for successfully submitted online requests

### 📡 Offline & SMS Fallback

Sahayam uses an offline-capable web app shell so the core citizen interface can remain available after being loaded.

When the backend cannot be reached, an emergency request can be converted into a structured SMS:

```text
DR1|MED|C|3|23.128|72.542
```

The message can be received through an **Android SMS Gateway** and forwarded to the FastAPI backend through a webhook.

### 📍 Geospatial Response Coordination

**PostGIS** powers location-aware operations including:

* Finding nearby available relief organisations
* Geographic distance calculations
* Responder matching
* Nearby hospital and shelter discovery
* Map-based operational monitoring

Critical requests can be broadcast to suitable organisations within an expanded response radius when required.

### 🔁 Duplicate Detection

Multiple people may report the same incident.

Sahayam combines **RapidFuzz text similarity** with **PostGIS spatial filtering** to identify potentially duplicate emergency reports and reduce unnecessary duplicate responses.

---

# 🤝 NGO / Relief Organisation Coordination

Sahayam includes a dedicated workflow for relief organisations.

Organisations can:

* Register with the platform
* Maintain their organisation profile
* Define capabilities
* View assigned requests
* Accept or reject requests
* Provide rejection reasons
* Track active workload
* Mark themselves available or unavailable
* Update response status
* Complete assigned requests

When an organisation rejects a request, the decision is retained so coordinators can reassign the case without losing the response history.

---

## 👤 Three Roles

Sahayam is designed around three primary actors:

| Citizen                   | Relief Organisation       | Coordinator / Admin       |
| ------------------------- | ------------------------- | ------------------------- |
| Submit emergency requests | Receive assigned requests | Monitor incoming requests |
| Track requests            | Accept / reject requests  | Verify requests           |
| Find nearby help          | Update response status    | Assign responders         |
| View helplines            | Manage availability       | Reassign requests         |
| View request history      | Track workload            | Monitor operations        |
| Use offline/SMS fallback  | Complete requests         | Analyse response data     |

---

# 🗺️ Operational Command Centre

The administrative interface provides a central view of the disaster response operation.

It brings together:

* Emergency request locations
* Request priorities
* Geographic zones
* Relief organisations
* Nearby facilities
* Heatmap visualisation
* Request status
* Verification state
* Assignment state
* Response analytics

The map is built using **MapLibre GL JS** and geographic data from **OpenStreetMap**.

Selecting a request can smoothly move the map to its exact location, allowing coordinators to inspect incidents geographically rather than relying only on tables.

---

# 🏥 Nearby Facilities

Citizens and coordinators can discover nearby emergency resources such as:

* Hospitals
* Shelters
* Relief points
* Other relevant facilities

OpenStreetMap data is retrieved and cached so the application does not need to repeatedly query external map services during normal operation.

---

# 🔄 End-to-End Response Flow

A typical request moves through the system as follows:

```text
                 CITIZEN
                    │
                    ▼
          Submit Emergency Request
                    │
                    ▼
          Validate + Locate Request
                    │
                    ▼
          Duplicate Detection
                    │
                    ▼
          Priority Classification
                    │
                    ▼
              ADMIN / AUTHORITY
                    │
          ┌─────────┴─────────┐
          ▼                   ▼
       Verify             Coordinate
                              │
                              ▼
                    Nearby NGO Matching
                              │
                              ▼
                    NGO Accepts Request
                              │
                              ▼
                         ON THE WAY
                              │
                              ▼
                           RESOLVED
                              │
                              ▼
                    CITIZEN TRACKING
```

---

# 📱 Citizen Tracking

Once an online request is successfully created, the citizen receives a tracking ID.

The response lifecycle is:

```text
Request Submitted
       ↓
NGO Dispatched
       ↓
NGO Accepted
       ↓
On the Way
       ↓
Resolved
```

This gives citizens visibility into what is happening after they request assistance.

---

# 🏗️ System Architecture

```text
┌─────────────────────────────────────────────┐
│                 CITIZEN                     │
│        Web / Mobile Browser / PWA           │
└──────────────────────┬──────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────┐
│              Vercel Frontend                │
│                                             │
│ React + TypeScript + Vite                   │
│ MapLibre GL JS                              │
│ Offline App Shell                           │
└──────────────────────┬──────────────────────┘
                       │ HTTPS
                       ▼
┌─────────────────────────────────────────────┐
│              FastAPI Backend                │
│                                             │
│ Request Processing                          │
│ Duplicate Detection                         │
│ Priority Classification                     │
│ NGO Coordination                            │
│ SMS Webhook                                 │
│ Facility / Map APIs                         │
└──────────────┬──────────────┬───────────────┘
               │              │
               ▼              ▼
┌─────────────────────┐   ┌──────────────────┐
│ PostgreSQL          │   │ OpenStreetMap    │
│ + PostGIS           │   │ / Overpass       │
│                     │   │ / Nominatim      │
│ Requests            │   └──────────────────┘
│ Organisations       │
│ Facilities          │
│ Spatial Data        │
└─────────────────────┘

          SMS FALLBACK PATH

Citizen
   │
   │ SMS
   ▼
Android SMS Gateway
   │
   │ HTTPS Webhook
   ▼
FastAPI /webhook/sms
   │
   ▼
PostgreSQL + PostGIS
```

---

# 🛠️ Technology Stack

### Frontend

* **React**
* **TypeScript**
* **Vite**
* **MapLibre GL JS**
* **OpenStreetMap**
* Progressive Web App / Service Worker
* IndexedDB / local browser storage for offline request handling

### Backend

* **Python**
* **FastAPI**
* **Uvicorn**
* **SQLAlchemy**
* **GeoAlchemy2**

### Database

* **PostgreSQL**
* **PostGIS**

Used for spatial queries, geographic distance calculations, responder matching, and location-based discovery.

### Data & Geospatial Services

* **OpenStreetMap**
* **Overpass API**
* **Nominatim**
* **PostGIS**

### Algorithms / Processing

* **RapidFuzz** — textual similarity and duplicate detection
* Geographic distance and spatial filtering through PostGIS

### Communication

* **Android SMS Gateway**
* Structured **DR1 emergency message protocol**
* FastAPI webhook integration

### Deployment

* **Vercel** — frontend
* **Render** — backend and PostgreSQL/PostGIS
* HTTPS-based API communication

---

