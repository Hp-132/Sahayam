import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import { saveCitizenSession } from "../../lib/session";

export default function CitizenLogin() {
  const nav = useNavigate();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (!login.trim() || !password) {
      setError("Enter phone/email and password.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.signin({ login: login.trim(), password });
      const citizen = res.citizen as {
        id: number; full_name: string; phone: string; email?: string; created_at?: string;
      };
      saveCitizenSession(citizen, res.token);
      nav("/citizen/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page">
      <div className="container" style={{ maxWidth: 480 }}>
        <div className="topbar">
          <Link to="/" className="brand">SAHAYAM</Link>
        </div>
        <div className="card">
          <h1 style={{ marginTop: 0 }}>Citizen Sign In</h1>
          <p className="muted">Sign in with the phone or email you registered.</p>
          <form onSubmit={onSubmit}>
            <div className="field">
              <label>Phone or Email</label>
              <input value={login} onChange={(e) => setLogin(e.target.value)} placeholder="Phone or email" autoComplete="username" />
            </div>
            <div className="field">
              <label>Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" autoComplete="current-password" />
            </div>
            {error && <p className="error-text">{error}</p>}
            <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
              {submitting ? "Signing in…" : "Sign In"}
            </button>
          </form>
          <p className="muted" style={{ marginTop: "1rem", marginBottom: 0 }}>
            New here? <Link to="/citizen/register">Create citizen account</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
