import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { isCitizenAuthenticated, isAdminAuthenticated, isNgoAuthenticated } from "../lib/session";
import logoSvg from "../assets/logo.svg";

export default function Landing() {
  const nav = useNavigate();
  const [showRoleModal, setShowRoleModal] = useState(false);

  const goCitizen = () => {
    if (isCitizenAuthenticated()) nav("/citizen/dashboard");
    else nav("/citizen/register");
  };

  const goAdmin = () => {
    if (isAdminAuthenticated()) nav("/admin");
    else nav("/admin/login");
  };

  const goNgo = () => {
    if (isNgoAuthenticated()) nav("/ngo");
    else nav("/ngo/login");
  };

  return (
    <div className="app-shell" style={{ background: "#f8fafc", color: "#0f172a" }}>
      {/* Official Government Header */}
      <header className="gov-header">
        <div className="gov-header-inner">
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div className="gov-logo-box" title="Sahayam Platform">
              <img src={logoSvg} alt="Sahayam Logo" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            </div>
            <span className="gov-title-text">SAHAYAM</span>
            <span className="gov-badge-official">Disaster Management Portal</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "1.25rem" }}>
            <button
              onClick={() => setShowRoleModal(true)}
              className="btn btn-accent"
              style={{ padding: "0.45rem 1rem", fontSize: "0.85rem" }}
            >
              Portal Login / Access
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main style={{ flex: 1 }}>
        {/* Hero Section - Clean Modern Government SaaS Hero */}
        <section
          style={{
            background: "linear-gradient(180deg, #e0f2fe 0%, #f0f9ff 40%, #ffffff 100%)",
            color: "#0f172a",
            padding: "4rem 1.5rem 4.5rem 1.5rem",
            borderBottom: "1px solid #e2e8f0",
            position: "relative",
          }}
        >
          <div className="container" style={{ textAlign: "center", maxWidth: "860px" }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                background: "#eff6ff",
                border: "1px solid #bfdbfe",
                padding: "0.35rem 1rem",
                borderRadius: "9999px",
                fontSize: "0.82rem",
                fontWeight: 600,
                color: "#1d4ed8",
                marginBottom: "1.4rem",
              }}
            >
              🛡️ Official Emergency Response & Disaster Management Portal
            </div>

            <h1 style={{ fontSize: "2.5rem", fontWeight: 800, lineHeight: 1.2, marginBottom: "1.1rem", color: "#0f172a", letterSpacing: "-0.02em" }}>
              Rapid Disaster Assistance & Spatial NGO Relief Coordination
            </h1>

            <p style={{ fontSize: "1.08rem", color: "#475569", maxWidth: "680px", margin: "0 auto 2.2rem auto", lineHeight: 1.6, fontWeight: 500 }}>
              Connecting citizens in distress with verified emergency response units and nearest NGO relief teams through PostGIS spatial intelligence.
            </p>

            <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
              <button
                onClick={goCitizen}
                className="btn btn-emergency"
                style={{ padding: "0.8rem 1.75rem", fontSize: "0.98rem", borderRadius: "8px" }}
              >
                🚨 Request Emergency Assistance
              </button>
              <button
                onClick={() => setShowRoleModal(true)}
                className="btn btn-primary"
                style={{ padding: "0.8rem 1.6rem", fontSize: "0.98rem", borderRadius: "8px" }}
              >
                Portal Login (Citizen / Authority / NGO)
              </button>
            </div>
          </div>
        </section>

        {/* Process Flow Section */}
        <section style={{ padding: "3.5rem 1.5rem", background: "#ffffff", borderBottom: "1px solid #e2e8f0" }}>
          <div className="container">
            <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
              <h2 style={{ fontSize: "1.8rem", fontWeight: 800, color: "#0f172a", marginBottom: "0.5rem" }}>
                How Sahayam Coordinates Disaster Response
              </h2>
              <p style={{ color: "#64748b", fontSize: "0.98rem" }}>
                End-to-end emergency workflow linking citizen submissions with authority verification and NGO dispatch.
              </p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1.5rem" }}>
              {[
                { step: "01", title: "Citizen Request", desc: "Citizen submits emergency assistance request online or via DR1 SMS fallback when offline.", icon: "📱" },
                { step: "02", title: "Verification", desc: "PostGIS spatial geofencing & RapidFuzz similarity engine analyze credibility and detect duplicate reports.", icon: "🔍" },
                { step: "03", title: "NGO Assignment", desc: "Admin reviews spatial diagnostics and assigns the nearest available NGO response organization.", icon: "🤝" },
                { step: "04", title: "Resolution", desc: "Response unit arrives on scene to provide medical, rescue, or shelter relief until resolved.", icon: "✅" },
              ].map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    borderTop: "3px solid #1d4ed8",
                    borderRadius: "8px",
                    padding: "1.5rem",
                    position: "relative",
                  }}
                >
                  <div style={{ fontSize: "0.75rem", fontWeight: 900, color: "#ea580c", marginBottom: "0.4rem" }}>
                    STEP {item.step}
                  </div>
                  <div style={{ fontSize: "1.8rem", marginBottom: "0.5rem" }}>{item.icon}</div>
                  <h3 style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0f172a", marginBottom: "0.4rem" }}>{item.title}</h3>
                  <p style={{ fontSize: "0.88rem", color: "#475569", lineHeight: 1.5 }}>{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Supported Emergency Services & Technology Grid */}
        <section style={{ padding: "3.5rem 1.5rem", background: "#f8fafc" }}>
          <div className="container">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2rem" }}>
              {/* Emergency Services */}
              <div className="gov-card">
                <div className="gov-card-header">
                  <h3 className="gov-card-title">📞 National Emergency Helplines</h3>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  {[
                    { name: "National Emergency Number", num: "112", desc: "Single number for Police, Fire & Ambulance" },
                    { name: "Ambulance / Medical", num: "108", desc: "Emergency medical transport" },
                    { name: "Fire & Rescue", num: "101", desc: "Fire safety and flood rescue" },
                    { name: "State Disaster Authority", num: "1070", desc: "State disaster control room" },
                    { name: "District Disaster Control", num: "1077", desc: "District emergency control room" },
                  ].map((h, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.6rem 0", borderBottom: "1px solid #f1f5f9" }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "#0f172a" }}>{h.name}</div>
                        <div style={{ fontSize: "0.78rem", color: "#64748b" }}>{h.desc}</div>
                      </div>
                      <a href={`tel:${h.num}`} className="btn btn-sm btn-secondary" style={{ fontWeight: 800, color: "#dc2626" }}>
                        📞 {h.num}
                      </a>
                    </div>
                  ))}
                </div>
              </div>

              {/* Technology Capabilities */}
              <div className="gov-card">
                <div className="gov-card-header">
                  <h3 className="gov-card-title">🛡 Platform Architecture Highlights</h3>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem", fontSize: "0.9rem" }}>
                  <div>
                    <strong style={{ color: "#0f172a" }}>📍 PostGIS Spatial Intelligence</strong>
                    <p style={{ color: "#475569", fontSize: "0.85rem", marginTop: "0.1rem" }}>
                      Validates coordinates against active disaster zone polygons and calculates exact spatial distances (`ST_Distance`) to nearest relief facilities.
                    </p>
                  </div>
                  <div>
                    <strong style={{ color: "#0f172a" }}>⚡ RapidFuzz Duplicate Detection</strong>
                    <p style={{ color: "#475569", fontSize: "0.85rem", marginTop: "0.1rem" }}>
                      Uses string similarity algorithms combined with spatial distance thresholds to detect and merge duplicate citizen emergency calls.
                    </p>
                  </div>
                  <div>
                    <strong style={{ color: "#0f172a" }}>📱 DR1 SMS Gateway Offline Fallback</strong>
                    <p style={{ color: "#475569", fontSize: "0.85rem", marginTop: "0.1rem" }}>
                      Enables offline emergency submissions via structured `DR1|TYPE|SEV|COUNT|LAT|LNG` SMS piped through an HTTPS gateway webhook.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Role Selection Modal */}
      {showRoleModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(15, 23, 42, 0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000, padding: "1rem" }}>
          <div style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "12px", padding: "2rem", maxWidth: "520px", width: "100%", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.2rem", paddingBottom: "0.75rem", borderBottom: "1px solid #e2e8f0" }}>
              <h3 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 800, color: "#0f172a" }}>Select Portal Access Role</h3>
              <button onClick={() => setShowRoleModal(false)} style={{ background: "none", border: "none", fontSize: "1.2rem", cursor: "pointer", color: "#64748b" }}>✕</button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <button
                onClick={goCitizen}
                style={{
                  background: "#f8fafc",
                  border: "2px solid #1d4ed8",
                  borderRadius: "8px",
                  padding: "1.2rem",
                  textAlign: "left",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "1rem",
                }}
              >
                <div style={{ fontSize: "2.2rem" }}>🚨</div>
                <div>
                  <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0f172a" }}>Citizen Portal</div>
                  <div style={{ fontSize: "0.85rem", color: "#475569" }}>Request emergency help, track requests, view nearby shelters & helplines.</div>
                </div>
              </button>

              <button
                onClick={goAdmin}
                style={{
                  background: "#f8fafc",
                  border: "2px solid #0f172a",
                  borderRadius: "8px",
                  padding: "1.2rem",
                  textAlign: "left",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "1rem",
                }}
              >
                <div style={{ fontSize: "2.2rem" }}>🛡</div>
                <div>
                  <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0f172a" }}>Admin / Authority Portal</div>
                  <div style={{ fontSize: "0.85rem", color: "#475569" }}>Command Center, request verification, PostGIS NGO dispatch & analytics.</div>
                </div>
              </button>

              <button
                onClick={goNgo}
                style={{
                  background: "#f8fafc",
                  border: "2px solid #ea580c",
                  borderRadius: "8px",
                  padding: "1.2rem",
                  textAlign: "left",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "1rem",
                }}
              >
                <div style={{ fontSize: "2.2rem" }}>🤝</div>
                <div>
                  <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0f172a" }}>NGO / Relief Organization Portal</div>
                  <div style={{ fontSize: "0.85rem", color: "#475569" }}>Receive assigned requests, accept or decline, update response progress. New organizations can register.</div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Official Footer */}
      <footer className="gov-footer">
        <div className="gov-footer-inner">
          <div>
            <div style={{ fontWeight: 800, color: "#ffffff", marginBottom: "0.2rem" }}>SAHAYAM Platform</div>
            <div>Geospatial Disaster-Response & NGO Coordination Framework</div>
          </div>
          <div>Academic & Demo Prototype — Preserving Official Disaster Mitigation Standards</div>
        </div>
      </footer>
    </div>
  );
}
