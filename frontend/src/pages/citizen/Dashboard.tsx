import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getCitizen, switchRole } from "../../lib/session";
import { api } from "../../api/client";
import logoSvg from "../../assets/logo.svg";

interface RequestItem {
  id: number;
  track_id?: string;
  type: string;
  severity: string;
  headcount: number;
  status: string;
  display_status?: string;
  credibility_score: number;
  assigned_team?: { name: string; org_name?: string } | null;
  created_at: string;
}

const TYPE_LABELS: Record<string, string> = {
  SAR: "Search & Rescue",
  MED: "Medical Emergency",
  FIRE: "Fire Emergency",
  MISSING: "Missing Person",
  EVAC: "Evacuation",
  SHELTER: "Shelter",
  FOOD: "Food",
  CLOTHES: "Clothing",
  SUPPLIES: "Medical Supplies",
  OTHER: "Other Emergency",
};

export default function CitizenDashboard() {
  const citizen = getCitizen();
  const nav = useNavigate();
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .listMyRequests({ limit: "20" })
      .then((data) => {
        setRequests(data as unknown as RequestItem[]);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const activeRequest = requests.find((r) => r.status !== "resolved");

  return (
    <div className="app-shell" style={{ background: "#f8fafc" }}>
      {/* Mobile Government Navigation Header */}
      <header className="gov-header">
        <div className="gov-header-inner" style={{ padding: "0.6rem 1rem" }}>
          <div className="gov-brand">
            <div className="gov-logo-box">
              <img src={logoSvg} alt="Sahayam" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            </div>
            <span className="gov-title-text" style={{ fontSize: "1.2rem" }}>SAHAYAM</span>
          </div>

          <button
            onClick={() => {
              switchRole();
              nav("/");
            }}
            className="btn btn-sm btn-secondary"
            style={{ background: "#ffffff", color: "#0f172a", fontSize: "0.8rem" }}
          >
            Switch Role
          </button>
        </div>

        {/* Sub-nav Bar */}
        <div style={{ background: "#1e293b", padding: "0.4rem 1rem", borderTop: "1px solid rgba(255,255,255,0.1)", display: "flex", gap: "0.5rem", overflowX: "auto" }}>
          <Link to="/citizen/dashboard" className="gov-nav-link active" style={{ fontSize: "0.8rem", padding: "0.3rem 0.6rem" }}>
            🏠 Home
          </Link>
          <Link to="/citizen/track" className="gov-nav-link" style={{ fontSize: "0.8rem", padding: "0.3rem 0.6rem" }}>
            📍 Track Request
          </Link>
          <Link to="/citizen/nearby" className="gov-nav-link" style={{ fontSize: "0.8rem", padding: "0.3rem 0.6rem" }}>
            🏥 Nearby Help
          </Link>
          <Link to="/citizen/helplines" className="gov-nav-link" style={{ fontSize: "0.8rem", padding: "0.3rem 0.6rem" }}>
            📞 Helplines
          </Link>
          <Link to="/citizen/profile" className="gov-nav-link" style={{ fontSize: "0.8rem", padding: "0.3rem 0.6rem" }}>
            👤 Profile
          </Link>
        </div>
      </header>

      {/* Main Mobile-First Content */}
      <main className="container-narrow" style={{ padding: "1.25rem 1rem" }}>
        {/* Welcome Banner */}
        <div style={{ marginBottom: "1rem" }}>
          <h1 style={{ fontSize: "1.4rem", fontWeight: 800, color: "#0f172a" }}>
            Welcome, {citizen?.fullName || "Citizen"}
          </h1>
          <p style={{ fontSize: "0.85rem", color: "#64748b" }}>
            Citizen Disaster Portal — Request immediate emergency aid or track responses.
          </p>
        </div>

        {/* 1. PROMINENT CTA: REQUEST EMERGENCY ASSISTANCE */}
        <Link
          to="/citizen/request"
          className="btn btn-emergency"
          style={{
            width: "100%",
            padding: "0.95rem 1.25rem",
            borderRadius: "10px",
            marginBottom: "1.5rem",
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            textDecoration: "none",
            boxShadow: "0 3px 10px rgba(159, 18, 57, 0.16)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
            <div style={{ fontSize: "1.25rem", background: "rgba(255,255,255,0.18)", width: "38px", height: "38px", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              🚨
            </div>
            <div style={{ textAlign: "left" }}>
              <div style={{ fontSize: "1.05rem", fontWeight: 800, letterSpacing: "0.01em", color: "#ffffff" }}>
                Request Emergency Assistance
              </div>
              <div style={{ fontSize: "0.78rem", opacity: 0.9, fontWeight: 500, marginTop: "0.15rem", color: "#ffe4e6" }}>
                SOS Rescue • Medical Emergency • Evacuation • Shelter
              </div>
            </div>
          </div>
          <span style={{ fontSize: "1.1rem", opacity: 0.9, fontWeight: 700, color: "#ffffff" }}>→</span>
        </Link>

        {/* 2. PRIORITIZED ACTIVE REQUEST TRACKING */}
        {activeRequest && (
          <div className="gov-card" style={{ borderLeft: "4px solid #1d4ed8" }}>
            <div className="gov-card-header" style={{ marginBottom: "0.6rem", paddingBottom: "0.5rem" }}>
              <span className="badge badge-navy">Active Request #{activeRequest.id}</span>
              <span style={{ fontSize: "0.8rem", color: "#1d4ed8", fontWeight: 700 }}>Live Tracking</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.8rem", fontSize: "0.9rem" }}>
              <div>
                <strong style={{ color: "#0f172a" }}>{TYPE_LABELS[activeRequest.type] || activeRequest.type}</strong>
                <div style={{ fontSize: "0.8rem", color: "#64748b" }}>{activeRequest.headcount} person(s) affected</div>
              </div>
              <span className={`badge badge-${activeRequest.status === "dispatched" ? "info" : "warning"}`}>
                {activeRequest.display_status || activeRequest.status}
              </span>
            </div>
            <Link to={`/citizen/track/${activeRequest.id}`} className="btn btn-sm btn-accent" style={{ width: "100%" }}>
              View Progress Timeline Stepper →
            </Link>
          </div>
        )}

        {/* 3. USEFUL ASSISTANCE OPTIONS GRID */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.85rem", marginBottom: "1.5rem" }}>
          <Link
            to="/citizen/track"
            className="gov-card"
            style={{ display: "flex", flexDirection: "column", alignItems: "center", textDecoration: "none", padding: "1.1rem 0.75rem", margin: 0 }}
          >
            <div style={{ fontSize: "1.8rem", marginBottom: "0.3rem" }}>📍</div>
            <div style={{ fontWeight: 800, fontSize: "0.95rem", color: "#0f172a" }}>Track Request</div>
            <div style={{ fontSize: "0.78rem", color: "#64748b", marginTop: "0.2rem", textAlign: "center" }}>Check response status</div>
          </Link>

          <Link
            to="/citizen/nearby"
            className="gov-card"
            style={{ display: "flex", flexDirection: "column", alignItems: "center", textDecoration: "none", padding: "1.1rem 0.75rem", margin: 0 }}
          >
            <div style={{ fontSize: "1.8rem", marginBottom: "0.3rem" }}>🏥</div>
            <div style={{ fontWeight: 800, fontSize: "0.95rem", color: "#0f172a" }}>Nearby Help</div>
            <div style={{ fontSize: "0.78rem", color: "#64748b", marginTop: "0.2rem", textAlign: "center" }}>Hospitals & shelters</div>
          </Link>

          <Link
            to="/citizen/helplines"
            className="gov-card"
            style={{ display: "flex", flexDirection: "column", alignItems: "center", textDecoration: "none", padding: "1.1rem 0.75rem", margin: 0 }}
          >
            <div style={{ fontSize: "1.8rem", marginBottom: "0.3rem" }}>📞</div>
            <div style={{ fontWeight: 800, fontSize: "0.95rem", color: "#0f172a" }}>Helplines</div>
            <div style={{ fontSize: "0.78rem", color: "#64748b", marginTop: "0.2rem", textAlign: "center" }}>Tap to dial 112, 108</div>
          </Link>

          <Link
            to="/citizen/profile"
            className="gov-card"
            style={{ display: "flex", flexDirection: "column", alignItems: "center", textDecoration: "none", padding: "1.1rem 0.75rem", margin: 0 }}
          >
            <div style={{ fontSize: "1.8rem", marginBottom: "0.3rem" }}>👤</div>
            <div style={{ fontWeight: 800, fontSize: "0.95rem", color: "#0f172a" }}>My Profile</div>
            <div style={{ fontSize: "0.78rem", color: "#64748b", marginTop: "0.2rem", textAlign: "center" }}>Saved profile info</div>
          </Link>
        </div>

        {/* 4. RECENT REQUEST HISTORY LIST */}
        <div className="gov-card">
          <div className="gov-card-header">
            <h3 className="gov-card-title">📋 Recent Emergency Submissions</h3>
          </div>
          {loading ? (
            <div style={{ fontSize: "0.85rem", color: "#64748b", padding: "1rem 0" }}>Loading history...</div>
          ) : requests.length === 0 ? (
            <div style={{ fontSize: "0.85rem", color: "#64748b", padding: "1rem 0" }}>No emergency requests recorded yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              {requests.slice(0, 5).map((r) => (
                <div
                  key={r.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "0.6rem 0",
                    borderBottom: "1px solid #f1f5f9",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "0.88rem", color: "#0f172a" }}>
                      #{r.id} · {TYPE_LABELS[r.type] || r.type}
                    </div>
                    <div style={{ fontSize: "0.78rem", color: "#64748b" }}>{r.headcount} person(s)</div>
                  </div>
                  <span className={`badge badge-${r.status === "resolved" ? "success" : r.status === "dispatched" ? "info" : "warning"}`}>
                    {r.display_status || r.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
