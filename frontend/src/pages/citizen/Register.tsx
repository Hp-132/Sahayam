import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import { saveCitizenSession } from "../../lib/session";

export default function CitizenRegister() {
  const nav = useNavigate();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    fullName: "", phone: "", email: "", password: "", confirmPassword: "",
  });

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (!form.fullName.trim() || !form.phone.trim() || !form.password) {
      setError("Please fill name, phone, and password.");
      return;
    }
    if (form.password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.signup({
        full_name: form.fullName.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        password: form.password,
      });
      const citizen = res.citizen as {
        id: number; full_name: string; phone: string; email?: string; created_at?: string;
      };
      saveCitizenSession(citizen, res.token);
      nav("/citizen/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page">
      <div className="container" style={{ maxWidth: 480 }}>
        <div className="topbar">
          <Link to="/" className="brand">SAHAYAM</Link>
          <Link to="/citizen/login" className="btn btn-ghost">Sign in</Link>
        </div>
        <div className="card">
          <h1 style={{ marginTop: 0 }}>Create Citizen Account</h1>
          <p className="muted">Account stored in PostgreSQL. Password is hashed — never stored in plain text.</p>
          <form onSubmit={onSubmit}>
            <div className="field">
              <label>Full Name *</label>
              <input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} placeholder="Your name" />
            </div>
            <div className="field">
              <label>Phone Number *</label>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="10-digit mobile" />
            </div>
            <div className="field">
              <label>Email (optional)</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" />
            </div>
            <div className="field">
              <label>Password *</label>
              <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Min 6 characters" />
            </div>
            <div className="field">
              <label>Confirm Password *</label>
              <input type="password" value={form.confirmPassword} onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} placeholder="Repeat password" />
            </div>
            {error && <p className="error-text">{error}</p>}
            <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
              {submitting ? "Creating account…" : "Sign Up"}
            </button>
          </form>
          <p className="muted" style={{ marginTop: "1rem", marginBottom: 0 }}>
            Already have an account? <Link to="/citizen/login">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
