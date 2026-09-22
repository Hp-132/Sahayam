import { FormEvent, useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { loginAdmin, isAdminAuthenticated } from "../../lib/session";
import logoSvg from "../../assets/logo.svg";

export default function AdminLogin() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (isAdminAuthenticated()) nav("/admin");
  }, [nav]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const result = loginAdmin(email, password);
    if (!result.ok) {
      setError(result.error || "Invalid admin credentials.");
      return;
    }
    nav("/admin");
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
            <span className="gov-badge-official">Admin Portal</span>
          </div>

          <Link to="/" className="btn btn-sm btn-secondary" style={{ background: "#ffffff", color: "#0f172a" }}>
            ← Public Home
          </Link>
        </div>
      </header>

      <main className="container-narrow" style={{ padding: "3rem 1rem" }}>
        <div className="gov-card" style={{ boxShadow: "var(--shadow-md)" }}>
          <div className="gov-card-header">
            <div>
              <h2 className="gov-card-title">🔐 Authority & Command Login</h2>
              <p className="text-muted" style={{ fontSize: "0.85rem", marginTop: "0.2rem" }}>
                Authorized emergency response personnel only.
              </p>
            </div>
          </div>

          <form onSubmit={onSubmit}>
            <div className="form-group">
              <label className="form-label">Admin Email ID</label>
              <input
                type="email"
                className="form-control"
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter admin email"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                type="password"
                className="form-control"
                autoComplete="off"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
              />
            </div>

            {error && (
              <div style={{ padding: "0.75rem", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "6px", color: "#b91c1c", fontSize: "0.88rem", marginBottom: "1rem" }}>
                {error}
              </div>
            )}

            <button type="submit" className="btn btn-primary btn-block" style={{ padding: "0.75rem" }}>
              Sign In to Command Center
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
