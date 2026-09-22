import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import { isNgoAuthenticated, saveNgoSession, NgoProfile } from "../../lib/session";
import logoSvg from "../../assets/logo.svg";

interface DemoAccount {
  email: string;
  unit_name: string;
  org_name?: string;
  status: string;
}

export default function NgoLogin() {
  const nav = useNavigate();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [demo, setDemo] = useState<{ password: string; accounts: DemoAccount[] } | null>(null);

  useEffect(() => {
    if (isNgoAuthenticated()) nav("/ngo");
    api.ngoDemoAccounts().then(setDemo).catch(() => setDemo(null));
  }, [nav]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (!login.trim() || !password) {
      setError("Enter your registered email / phone and password.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.ngoSignin({ login: login.trim(), password });
      saveNgoSession(res.ngo as unknown as NgoProfile, res.token);
      nav("/ngo");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setSubmitting(false);
    }
  };

  const pickDemo = (email: string) => {
    setLogin(email);
    if (demo) setPassword(demo.password);
    setError("");
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
            <span className="gov-badge-official">NGO Portal</span>
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
              <h2 className="gov-card-title">🤝 NGO / Relief Organization Login</h2>
              <p className="text-muted" style={{ fontSize: "0.85rem", marginTop: "0.2rem" }}>
                Respond to requests assigned by the disaster control room.
              </p>
            </div>
          </div>

          <form onSubmit={onSubmit}>
            <div className="form-group">
              <label className="form-label">Registered Email or Phone</label>
              <input
                className="form-control"
                autoComplete="username"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                placeholder="operations@yourngo.org"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                type="password"
                className="form-control"
                autoComplete="current-password"
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

            <button type="submit" className="btn btn-primary btn-block" style={{ padding: "0.75rem" }} disabled={submitting}>
              {submitting ? "Signing in…" : "Sign In to NGO Dashboard"}
            </button>
          </form>

          <p style={{ fontSize: "0.88rem", color: "var(--text-muted)", marginTop: "1.1rem", marginBottom: 0, textAlign: "center" }}>
            Organization not on Sahayam yet?{" "}
            <Link to="/ngo/register" style={{ color: "var(--gov-blue)", fontWeight: 700 }}>
              Register your organization
            </Link>
          </p>
        </div>

        {demo && demo.accounts.length > 0 && (
          <div className="gov-card" style={{ background: "#fffbeb", borderColor: "#fde68a" }}>
            <div style={{ fontSize: "0.8rem", fontWeight: 800, textTransform: "uppercase", color: "#b45309", marginBottom: "0.4rem" }}>
              Demo organization accounts
            </div>
            <p style={{ fontSize: "0.82rem", color: "#475569", marginBottom: "0.6rem" }}>
              Seeded simulated units share the password <code>{demo.password}</code>. Pick the organization the admin assigned:
            </p>
            <select className="form-control" value="" onChange={(e) => e.target.value && pickDemo(e.target.value)}>
              <option value="">Select a demo organization…</option>
              {demo.accounts.map((a) => (
                <option key={a.email} value={a.email}>
                  {a.unit_name} ({a.status})
                </option>
              ))}
            </select>
          </div>
        )}
      </main>
    </div>
  );
}
