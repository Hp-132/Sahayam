import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import { saveNgoSession, NgoProfile } from "../../lib/session";
import { SERVICE_LABELS } from "../../lib/ngo";
import logoSvg from "../../assets/logo.svg";

const DEFAULT_ORG_TYPES = [
  "Registered NGO / Society",
  "Charitable Trust",
  "Section 8 Company",
  "Government / Statutory Agency",
  "Community Volunteer Group",
  "Faith-based Organisation",
];

const sectionTitle: React.CSSProperties = {
  fontSize: "0.8rem",
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "var(--gov-blue)",
  margin: "0.4rem 0 0.8rem",
  paddingBottom: "0.35rem",
  borderBottom: "1px solid var(--border-subtle)",
};

const grid2: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "0 1rem",
};

export default function NgoRegister() {
  const nav = useNavigate();
  const [orgTypes, setOrgTypes] = useState<string[]>(DEFAULT_ORG_TYPES);
  const [serviceCodes, setServiceCodes] = useState<string[]>(Object.keys(SERVICE_LABELS));
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [locating, setLocating] = useState(false);
  const [form, setForm] = useState({
    org_name: "",
    org_type: DEFAULT_ORG_TYPES[0],
    registration_number: "",
    years_experience: "",
    contact_person: "",
    phone: "",
    email: "",
    headquarters: "",
    latitude: "",
    longitude: "",
    operating_areas: "",
    services: [] as string[],
    team_size: "",
    capacity: "3",
    password: "",
    confirmPassword: "",
  });

  useEffect(() => {
    api
      .ngoOptions()
      .then((o) => {
        if (o.org_types?.length) setOrgTypes(o.org_types);
        if (o.services?.length) setServiceCodes(o.services);
      })
      .catch(() => undefined);
  }, []);

  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const toggleService = (code: string) =>
    setForm((f) => ({
      ...f,
      services: f.services.includes(code) ? f.services.filter((s) => s !== code) : [...f.services, code],
    }));

  const detectLocation = () => {
    if (!navigator.geolocation) {
      setError("Geolocation is not available on this device. Enter coordinates or rely on the address.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((f) => ({
          ...f,
          latitude: pos.coords.latitude.toFixed(6),
          longitude: pos.coords.longitude.toFixed(6),
        }));
        setLocating(false);
      },
      () => {
        setLocating(false);
        setError("Could not detect location. The headquarters address will be geocoded instead.");
      }
    );
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    const required: [keyof typeof form, string][] = [
      ["org_name", "organization name"],
      ["contact_person", "contact person"],
      ["phone", "phone"],
      ["email", "email"],
      ["headquarters", "headquarters address"],
      ["operating_areas", "operating districts"],
      ["team_size", "team size"],
    ];
    const missing = required.filter(([k]) => !String(form[k]).trim()).map(([, label]) => label);
    if (missing.length) {
      setError(`Please fill: ${missing.join(", ")}.`);
      return;
    }
    if (form.services.length === 0) {
      setError("Select at least one service your organization provides.");
      return;
    }
    if ((form.latitude && !form.longitude) || (!form.latitude && form.longitude)) {
      setError("Enter both latitude and longitude, or leave both empty to use the address.");
      return;
    }
    if (form.password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.ngoRegister({
        org_name: form.org_name.trim(),
        org_type: form.org_type,
        registration_number: form.registration_number.trim() || null,
        years_experience: form.years_experience ? Number(form.years_experience) : null,
        contact_person: form.contact_person.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        headquarters: form.headquarters.trim(),
        latitude: form.latitude ? Number(form.latitude) : null,
        longitude: form.longitude ? Number(form.longitude) : null,
        operating_areas: form.operating_areas.trim(),
        services: form.services,
        team_size: Number(form.team_size),
        capacity: Number(form.capacity) || 1,
        password: form.password,
      });
      saveNgoSession(res.ngo as unknown as NgoProfile, res.token);
      nav("/ngo");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="app-shell" style={{ background: "#f8fafc" }}>
      <header className="gov-header">
        <div className="gov-header-inner">
          <div className="gov-brand">
            <div className="gov-logo-box">
              <img src={logoSvg} alt="Sahayam" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            </div>
            <span className="gov-title-text">SAHAYAM</span>
            <span className="gov-badge-official">NGO Registration</span>
          </div>

          <Link to="/ngo/login" className="btn btn-sm btn-secondary" style={{ background: "#ffffff", color: "#0f172a" }}>
            Sign in
          </Link>
        </div>
      </header>

      <main className="container" style={{ maxWidth: "780px", padding: "2rem 1rem" }}>
        <div className="gov-card" style={{ boxShadow: "var(--shadow-md)" }}>
          <div className="gov-card-header">
            <div>
              <h2 className="gov-card-title">🤝 Register Relief Organization</h2>
              <p className="text-muted" style={{ fontSize: "0.85rem", marginTop: "0.2rem" }}>
                Once registered, the control room can assign nearby emergency requests matching your services.
              </p>
            </div>
          </div>

          <form onSubmit={onSubmit}>
            <div style={sectionTitle}>Organization</div>
            <div className="form-group">
              <label className="form-label">Organization Name *</label>
              <input className="form-control" value={form.org_name} onChange={(e) => set("org_name", e.target.value)} placeholder="e.g. Surat Flood Relief Trust" />
            </div>
            <div style={grid2}>
              <div className="form-group">
                <label className="form-label">Organization Type *</label>
                <select className="form-control" value={form.org_type} onChange={(e) => set("org_type", e.target.value)}>
                  {orgTypes.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Registration No. (NGO Darpan / Trust / CIN)</label>
                <input className="form-control" value={form.registration_number} onChange={(e) => set("registration_number", e.target.value)} placeholder="Optional" />
              </div>
              <div className="form-group">
                <label className="form-label">Years of Relief Experience</label>
                <input type="number" min={0} className="form-control" value={form.years_experience} onChange={(e) => set("years_experience", e.target.value)} placeholder="e.g. 8" />
              </div>
            </div>

            <div style={sectionTitle}>Contact</div>
            <div style={grid2}>
              <div className="form-group">
                <label className="form-label">Contact Person *</label>
                <input className="form-control" value={form.contact_person} onChange={(e) => set("contact_person", e.target.value)} placeholder="Operations lead" />
              </div>
              <div className="form-group">
                <label className="form-label">Phone *</label>
                <input className="form-control" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+91 98XXXXXXXX" />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Official Email *</label>
              <input type="email" className="form-control" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="operations@yourngo.org" />
            </div>

            <div style={sectionTitle}>Operations</div>
            <div className="form-group">
              <label className="form-label">Headquarters / Base Address *</label>
              <input className="form-control" value={form.headquarters} onChange={(e) => set("headquarters", e.target.value)} placeholder="Street, area, city" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "0 1rem", alignItems: "end" }}>
              <div className="form-group">
                <label className="form-label">Base Latitude</label>
                <input className="form-control" value={form.latitude} onChange={(e) => set("latitude", e.target.value)} placeholder="Auto from address" />
              </div>
              <div className="form-group">
                <label className="form-label">Base Longitude</label>
                <input className="form-control" value={form.longitude} onChange={(e) => set("longitude", e.target.value)} placeholder="Auto from address" />
              </div>
              <div className="form-group">
                <button type="button" className="btn btn-secondary btn-block" onClick={detectLocation} disabled={locating}>
                  📍 {locating ? "Detecting…" : "Detect location"}
                </button>
              </div>
            </div>
            <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "-0.4rem", marginBottom: "1rem" }}>
              Your base location is used to match you with nearby requests.
            </p>
            <div className="form-group">
              <label className="form-label">Operating Districts / Areas *</label>
              <input className="form-control" value={form.operating_areas} onChange={(e) => set("operating_areas", e.target.value)} placeholder="e.g. Surat, Navsari, Valsad" />
            </div>

            <div className="form-group">
              <label className="form-label">Services Provided *</label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: "0.45rem" }}>
                {serviceCodes.map((code) => {
                  const on = form.services.includes(code);
                  return (
                    <label
                      key={code}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        padding: "0.5rem 0.7rem",
                        border: `1px solid ${on ? "#bfdbfe" : "var(--border-subtle)"}`,
                        background: on ? "#eff6ff" : "#ffffff",
                        borderRadius: "6px",
                        fontSize: "0.85rem",
                        fontWeight: on ? 700 : 500,
                        color: on ? "#1d4ed8" : "#334155",
                        cursor: "pointer",
                      }}
                    >
                      <input type="checkbox" checked={on} onChange={() => toggleService(code)} />
                      {SERVICE_LABELS[code] || code}
                    </label>
                  );
                })}
              </div>
            </div>

            <div style={grid2}>
              <div className="form-group">
                <label className="form-label">Field Team Size (people) *</label>
                <input type="number" min={1} className="form-control" value={form.team_size} onChange={(e) => set("team_size", e.target.value)} placeholder="e.g. 25" />
              </div>
              <div className="form-group">
                <label className="form-label">Requests You Can Handle at Once *</label>
                <input type="number" min={1} max={50} className="form-control" value={form.capacity} onChange={(e) => set("capacity", e.target.value)} />
              </div>
            </div>

            <div style={sectionTitle}>Login Credentials</div>
            <div style={grid2}>
              <div className="form-group">
                <label className="form-label">Password *</label>
                <input type="password" className="form-control" autoComplete="new-password" value={form.password} onChange={(e) => set("password", e.target.value)} placeholder="Min 8 characters" />
              </div>
              <div className="form-group">
                <label className="form-label">Confirm Password *</label>
                <input type="password" className="form-control" autoComplete="new-password" value={form.confirmPassword} onChange={(e) => set("confirmPassword", e.target.value)} placeholder="Repeat password" />
              </div>
            </div>

            {error && (
              <div style={{ padding: "0.75rem", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "6px", color: "#b91c1c", fontSize: "0.88rem", marginBottom: "1rem" }}>
                {error}
              </div>
            )}

            <button type="submit" className="btn btn-primary btn-block" style={{ padding: "0.75rem" }} disabled={submitting}>
              {submitting ? "Registering…" : "Register Organization"}
            </button>
          </form>

          <p style={{ fontSize: "0.88rem", color: "var(--text-muted)", marginTop: "1rem", marginBottom: 0, textAlign: "center" }}>
            Already registered?{" "}
            <Link to="/ngo/login" style={{ color: "var(--gov-blue)", fontWeight: 700 }}>
              Sign in
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
