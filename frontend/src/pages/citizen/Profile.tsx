import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getCitizen, saveCitizen, switchRole } from "../../lib/session";
import logoSvg from "../../assets/logo.svg";

export default function CitizenProfile() {
  const existing = getCitizen()!;
  const nav = useNavigate();
  const [form, setForm] = useState({ ...existing });
  const [saved, setSaved] = useState(false);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    saveCitizen(form);
    setSaved(true);
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

          <Link to="/citizen/dashboard" className="btn btn-sm btn-secondary" style={{ background: "#ffffff", color: "#0f172a" }}>
            ← Back
          </Link>
        </div>
      </header>

      <main className="container-narrow" style={{ padding: "1.5rem 1rem" }}>
        <div className="gov-card">
          <div className="gov-card-header">
            <div>
              <span className="badge badge-navy">Role: Citizen</span>
              <h2 className="gov-card-title" style={{ marginTop: "0.3rem" }}>👤 Citizen Profile Details</h2>
            </div>
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              onClick={() => {
                switchRole();
                nav("/");
              }}
            >
              Switch Role
            </button>
          </div>

          <form onSubmit={onSubmit}>
            <div className="form-group">
              <label className="form-label">Full Name *</label>
              <input
                className="form-control"
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Mobile Phone *</label>
              <input
                className="form-control"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Email Address *</label>
              <input
                className="form-control"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Primary Address / Local Area *</label>
              <input
                className="form-control"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Nearby Landmark</label>
              <input
                className="form-control"
                value={form.landmark || ""}
                onChange={(e) => setForm({ ...form, landmark: e.target.value })}
              />
            </div>

            {saved && (
              <div style={{ padding: "0.75rem", background: "#f0fdf4", border: "1px solid #86efac", borderRadius: "6px", color: "#16a34a", fontSize: "0.88rem", marginBottom: "1rem" }}>
                ✓ Profile details saved successfully on device.
              </div>
            )}

            <button type="submit" className="btn btn-primary btn-block">
              Save Profile Changes
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
