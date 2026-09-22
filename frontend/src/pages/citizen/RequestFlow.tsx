import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import {
  buildDr1Sms,
  enqueueOfflineRequest,
  openSmsComposer,
  updateOfflineRequest,
} from "../../lib/offlineQueue";
import { priorityForType, syncPriorityMap, PRIORITY_LABELS } from "../../lib/priority";
import logoSvg from "../../assets/logo.svg";

const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "SAR", label: "Search & Rescue" },
  { value: "MED", label: "Medical Emergency" },
  { value: "FIRE", label: "Fire Emergency" },
  { value: "MISSING", label: "Missing Person" },
  { value: "EVAC", label: "Evacuation" },
  { value: "SHELTER", label: "Shelter" },
  { value: "FOOD", label: "Food" },
  { value: "CLOTHES", label: "Clothing" },
  { value: "SUPPLIES", label: "Medical Supplies" },
  { value: "OTHER", label: "Other Emergency" },
];

function typeLabel(code: string): string {
  return TYPE_OPTIONS.find((o) => o.value === code)?.label ?? code;
}

const PRIORITY_HINTS: Record<string, string> = {
  C: "Immediate threat to life — nearby NGOs are alerted at once",
  M: "Urgent relief — the nearest suitable NGO will be assigned",
  L: "Non-urgent — handled after critical and medium requests",
};

function priorityColor(code: string): string {
  return code === "C" ? "#dc2626" : code === "M" ? "#d97706" : "#2a9d8f";
}

export default function CitizenRequest() {
  const nav = useNavigate();
  const [step, setStep] = useState(1);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [offlineLocalId, setOfflineLocalId] = useState<string | null>(null);
  const [smsPrepared, setSmsPrepared] = useState(false);
  const [form, setForm] = useState({
    type: "MED",
    other_description: "",
    headcount: 1,
    location_source: "gps" as "gps" | "landmark",
    latitude: "",
    longitude: "",
    landmark_text: "",
  });

  // Priority is set by the backend from the request type; keep the local copy fresh
  const [, setPriorityVersion] = useState(0);
  const priority = priorityForType(form.type);
  useEffect(() => {
    syncPriorityMap().then(() => setPriorityVersion((v) => v + 1));
  }, []);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const prepareOfflineSms = () => {
    const lat = form.latitude ? parseFloat(form.latitude) : undefined;
    const lng = form.longitude ? parseFloat(form.longitude) : undefined;
    const sms = buildDr1Sms({
      type: form.type,
      severity: priority,
      headcount: Number(form.headcount) || 1,
      lat,
      lng,
      landmark: form.landmark_text,
    });
    const entry = enqueueOfflineRequest({
      type: form.type,
      severity: priority,
      headcount: Number(form.headcount) || 1,
      latitude: lat,
      longitude: lng,
      landmark_text: form.location_source === "landmark" ? form.landmark_text : undefined,
      other_description: form.type === "OTHER" ? form.other_description : undefined,
      location_source: form.location_source,
      smsText: sms,
      status: "Pending Transmission",
    });
    setOfflineLocalId(entry.localId);
    updateOfflineRequest(entry.localId, { status: "SMS Prepared" });
    setSmsPrepared(true);
    setError("");
    openSmsComposer(sms);
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setError("Geolocation not available on this device.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((f) => ({
          ...f,
          location_source: "gps",
          latitude: String(pos.coords.latitude.toFixed(6)),
          longitude: String(pos.coords.longitude.toFixed(6)),
        }));
        setError("");
      },
      () => setError("Could not acquire GPS position. Enter coordinates or use landmark text.")
    );
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    setSmsPrepared(false);

    const lat = form.latitude ? parseFloat(form.latitude) : undefined;
    const lng = form.longitude ? parseFloat(form.longitude) : undefined;

    if (!navigator.onLine) {
      prepareOfflineSms();
      setSubmitting(false);
      return;
    }

    const body: Record<string, unknown> = {
      type: form.type,
      other_description: form.type === "OTHER" ? form.other_description : null,
      headcount: Number(form.headcount) || 1,
      location_source: form.location_source,
      landmark_text: form.location_source === "landmark" ? form.landmark_text : null,
      source: "app",
      latitude: lat,
      longitude: lng,
    };

    try {
      const res = (await api.createRequest(body)) as { id: number; track_id: string };
      nav(`/citizen/track/${encodeURIComponent(res.track_id || String(res.id))}`);
    } catch {
      prepareOfflineSms();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="app-shell" style={{ background: "#f8fafc" }}>
      {/* Header */}
      <header className="gov-header">
        <div className="gov-header-inner" style={{ padding: "0.6rem 1rem" }}>
          <div className="gov-brand">
            <div className="gov-logo-box">
              <img src={logoSvg} alt="Sahayam" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            </div>
            <span className="gov-title-text" style={{ fontSize: "1.2rem" }}>SAHAYAM</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span className="badge" style={{ background: online ? "#dcfce7" : "#fef3c7", color: online ? "#166534" : "#92400e", fontSize: "0.75rem" }}>
              {online ? "Online" : "Offline"}
            </span>
            <Link to="/citizen/dashboard" className="btn btn-sm btn-secondary" style={{ background: "#ffffff", color: "#0f172a" }}>
              ← Back
            </Link>
          </div>
        </div>
      </header>

      <main className="container-narrow" style={{ padding: "1.5rem 1rem" }}>
        {/* Stepper Header */}
        <div className="stepper-container">
          <div className="stepper-step">
            <div className={`stepper-circle ${step === 1 ? "active" : step > 1 ? "completed" : ""}`}>1</div>
            <div className={`stepper-label ${step === 1 ? "active" : ""}`}>Assistance</div>
          </div>
          <div style={{ flex: 1, height: "2px", background: step > 1 ? "#16a34a" : "#cbd5e1", margin: "0 0.5rem" }}></div>
          <div className="stepper-step">
            <div className={`stepper-circle ${step === 2 ? "active" : step > 2 ? "completed" : ""}`}>2</div>
            <div className={`stepper-label ${step === 2 ? "active" : ""}`}>Location</div>
          </div>
          <div style={{ flex: 1, height: "2px", background: step > 2 ? "#16a34a" : "#cbd5e1", margin: "0 0.5rem" }}></div>
          <div className="stepper-step">
            <div className={`stepper-circle ${step === 3 ? "active" : ""}`}>3</div>
            <div className={`stepper-label ${step === 3 ? "active" : ""}`}>Review</div>
          </div>
        </div>

        <div className="gov-card">
          <div className="gov-card-header">
            <h2 className="gov-card-title">🚨 Request Emergency Assistance</h2>
            <span style={{ fontSize: "0.8rem", color: "#ea580c", fontWeight: 700 }}>Step {step} of 3</span>
          </div>

          {step === 1 && (
            <div>
              <div className="form-group">
                <label className="form-label">Type of Emergency Assistance Needed *</label>
                <select
                  className="form-control"
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                >
                  {TYPE_OPTIONS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              {form.type === "OTHER" && (
                <div className="form-group">
                  <label className="form-label">Emergency Description *</label>
                  <textarea
                    className="form-control"
                    rows={3}
                    value={form.other_description}
                    onChange={(e) => setForm({ ...form, other_description: e.target.value })}
                    placeholder="Describe specific help needed..."
                  />
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Priority (set automatically)</label>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.6rem",
                    padding: "0.6rem 0.85rem",
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    borderRadius: "6px",
                    fontSize: "0.85rem",
                  }}
                >
                  <span className={`badge badge-${priority === "C" ? "critical" : priority === "M" ? "warning" : "success"}`}>
                    {PRIORITY_LABELS[priority]}
                  </span>
                  <span style={{ color: "#475569" }}>{PRIORITY_HINTS[priority]}</span>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Number of People Requiring Aid *</label>
                <input
                  type="number"
                  className="form-control"
                  min={1}
                  value={form.headcount}
                  onChange={(e) => setForm({ ...form, headcount: Number(e.target.value) })}
                />
              </div>

              <button type="button" className="btn btn-accent btn-block" onClick={() => setStep(2)}>
                Next Step: Location Details →
              </button>
            </div>
          )}

          {step === 2 && (
            <div>
              <div className="form-group">
                <label className="form-label">Location Input Method</label>
                <select
                  className="form-control"
                  value={form.location_source}
                  onChange={(e) =>
                    setForm({ ...form, location_source: e.target.value as "gps" | "landmark" })
                  }
                >
                  <option value="gps">GPS Device Coordinates</option>
                  <option value="landmark">Landmark / Local Area Address</option>
                </select>
              </div>

              {form.location_source === "gps" ? (
                <div>
                  <button type="button" className="btn btn-secondary btn-block" onClick={useMyLocation} style={{ marginBottom: "1rem" }}>
                    📍 Detect My Current Location (GPS)
                  </button>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.85rem" }}>
                    <div className="form-group">
                      <label className="form-label">Latitude</label>
                      <input
                        className="form-control"
                        value={form.latitude}
                        onChange={(e) => setForm({ ...form, latitude: e.target.value })}
                        placeholder="e.g. 21.1702"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Longitude</label>
                      <input
                        className="form-control"
                        value={form.longitude}
                        onChange={(e) => setForm({ ...form, longitude: e.target.value })}
                        placeholder="e.g. 72.8311"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="form-group">
                  <label className="form-label">Landmark Description / Address *</label>
                  <input
                    className="form-control"
                    value={form.landmark_text}
                    onChange={(e) => setForm({ ...form, landmark_text: e.target.value })}
                    placeholder="e.g. Near Porbandar Fishing Harbour, Railway Gate 4"
                  />
                </div>
              )}

              {error && <p style={{ color: "#dc2626", fontSize: "0.85rem", marginBottom: "1rem" }}>{error}</p>}

              <div style={{ display: "flex", gap: "0.75rem" }}>
                <button type="button" className="btn btn-secondary" onClick={() => setStep(1)}>
                  ← Back
                </button>
                <button
                  type="button"
                  className="btn btn-accent"
                  style={{ flex: 1 }}
                  onClick={() => {
                    if (form.location_source === "gps") {
                      const lat = parseFloat(form.latitude);
                      const lng = parseFloat(form.longitude);
                      if (!form.latitude || !form.longitude || isNaN(lat) || isNaN(lng)) {
                        setError("Enter valid latitude and longitude, or click 'Detect My Current Location'.");
                        return;
                      }
                    } else if (!form.landmark_text.trim()) {
                      setError("Enter a landmark or local address description.");
                      return;
                    }
                    setError("");
                    setStep(3);
                  }}
                >
                  Next Step: Review & Submit →
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <form onSubmit={submit}>
              <div style={{ background: "#f8fafc", padding: "1rem", borderRadius: "8px", border: "1px solid #e2e8f0", marginBottom: "1.2rem", fontSize: "0.9rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                  <span style={{ color: "#64748b" }}>Assistance Type:</span>
                  <strong style={{ color: "#0f172a" }}>{typeLabel(form.type)}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                  <span style={{ color: "#64748b" }}>Priority (automatic):</span>
                  <strong style={{ color: priorityColor(priority) }}>{PRIORITY_LABELS[priority]}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                  <span style={{ color: "#64748b" }}>People Affected:</span>
                  <strong style={{ color: "#0f172a" }}>{form.headcount} person(s)</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#64748b" }}>Location:</span>
                  <strong style={{ color: "#0f172a" }}>
                    {form.location_source === "gps" ? `${form.latitude}, ${form.longitude}` : form.landmark_text}
                  </strong>
                </div>
              </div>

              {error && (
                <div style={{ padding: "0.85rem", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "8px", color: "#b91c1c", fontSize: "0.88rem", marginBottom: "1rem" }}>
                  {error}
                </div>
              )}

              {smsPrepared && (
                <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "8px", padding: "1rem", marginBottom: "1.2rem" }}>
                  <div style={{ fontWeight: 800, color: "#d97706", fontSize: "0.95rem", marginBottom: "0.3rem" }}>
                    Saved offline — send via SMS
                  </div>
                  <p style={{ fontSize: "0.82rem", color: "#475569", marginBottom: "0.6rem" }}>
                    SMS prepared. Tap Send in your messaging app to transmit your request.
                    No Track ID yet — the real Track ID appears after the SMS reaches Sahayam.
                  </p>
                  <p style={{ fontSize: "0.78rem", color: "#64748b" }}>
                    Status: <strong>SMS Prepared</strong>
                    {offlineLocalId ? ` · Local ref: ${offlineLocalId}` : ""}
                  </p>
                  <button
                    type="button"
                    className="btn btn-secondary btn-block"
                    style={{ marginTop: "0.75rem" }}
                    onClick={() => {
                      const lat = form.latitude ? parseFloat(form.latitude) : undefined;
                      const lng = form.longitude ? parseFloat(form.longitude) : undefined;
                      openSmsComposer(buildDr1Sms({
                        type: form.type, severity: priority,
                        headcount: Number(form.headcount) || 1, lat, lng, landmark: form.landmark_text,
                      }));
                    }}
                  >
                    Open SMS app again ↗
                  </button>
                </div>
              )}

              <div style={{ display: "flex", gap: "0.75rem" }}>
                <button type="button" className="btn btn-secondary" onClick={() => setStep(2)}>
                  ← Back
                </button>
                <button type="submit" className="btn btn-emergency" style={{ flex: 1 }} disabled={submitting}>
                  {submitting ? "Submitting..." : "🚨 Transmit Emergency Request"}
                </button>
              </div>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
