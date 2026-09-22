import { Link } from "react-router-dom";
import logoSvg from "../../assets/logo.svg";

interface Helpline {
  name: string;
  number: string;
  desc: string;
  icon: string;
  primary?: boolean;
}

const HELPLINES: Helpline[] = [
  { name: "National Emergency Number", number: "112", desc: "Single number for Police, Fire & Ambulance", icon: "🚨", primary: true },
  { name: "Ambulance / Medical Emergency", number: "108", desc: "Emergency medical transport & triage", icon: "🚑", primary: true },
  { name: "Fire & Rescue Services", number: "101", desc: "Fire hazards & flood emergency rescue", icon: "🚒" },
  { name: "Police Emergency Control", number: "100", desc: "Police assistance & public safety", icon: "👮" },
  { name: "State Disaster Management", number: "1070", desc: "State level disaster control room", icon: "🌊" },
  { name: "District Collectorate Control", number: "1077", desc: "District disaster helpline & relief info", icon: "🏛" },
  { name: "NDRF Central Control Room", number: "011-24363260", desc: "National Disaster Response Force HQ", icon: "🛟" },
  { name: "Women Helpline", number: "1091", desc: "Emergency assistance for women in distress", icon: "🛡" },
];

export default function EmergencyHelplines() {
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

          <Link to="/citizen/dashboard" className="btn btn-sm btn-secondary" style={{ background: "#ffffff", color: "#0f172a" }}>
            ← Back
          </Link>
        </div>
      </header>

      <main className="container-narrow" style={{ padding: "1.5rem 1rem" }}>
        <div style={{ marginBottom: "1.2rem" }}>
          <h1 style={{ fontSize: "1.4rem", fontWeight: 800, color: "#dc2626" }}>📞 Emergency Helplines Directory</h1>
          <p style={{ fontSize: "0.85rem", color: "#64748b" }}>
            Official emergency control rooms. Tap any button to call immediately.
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
          {HELPLINES.map((h, idx) => (
            <div
              key={idx}
              className="gov-card"
              style={{
                margin: 0,
                borderLeft: h.primary ? "4px solid #dc2626" : "1px solid #e2e8f0",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "1rem",
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.2rem" }}>
                  <span>{h.icon}</span>
                  <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 800, color: "#0f172a" }}>{h.name}</h3>
                </div>
                <div style={{ fontSize: "0.82rem", color: "#64748b" }}>{h.desc}</div>
              </div>

              <a
                href={`tel:${h.number.replace(/[^0-9+]/g, "")}`}
                className={h.primary ? "btn btn-emergency" : "btn btn-accent"}
                style={{ whiteSpace: "nowrap", padding: "0.55rem 1rem", fontSize: "0.9rem" }}
              >
                📞 {h.number}
              </a>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
