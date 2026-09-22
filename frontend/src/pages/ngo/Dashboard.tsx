import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import { clearNgo, getNgo, saveNgoSession, setActiveRole, NgoProfile } from "../../lib/session";
import {
  SERVICE_LABELS, ASSIGNMENT_STATUS_LABELS, ASSIGNMENT_STATUS_BADGE, TEAM_STATUS_BADGE, km,
} from "../../lib/ngo";
import logoSvg from "../../assets/logo.svg";

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
const SEVERITY_LABELS: Record<string, string> = { C: "Critical", M: "Medium", L: "Low" };
const REJECT_REASONS = [
  "At full capacity",
  "Outside our operating area",
  "Required capability not available",
  "Team / vehicles unavailable",
  "Access route blocked",
];
const REFRESH_MS = 10_000;

interface RequestBrief {
  id: number;
  track_id?: string | null;
  type: string;
  other_description?: string | null;
  severity: string;
  headcount: number;
  status: string;
  response_stage?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  landmark_text?: string | null;
  source?: string;
  credibility_score: number;
  report_count: number;
  created_at?: string;
}

interface Assignment {
  id: number;
  request_id: number;
  mode: "direct" | "broadcast";
  status: string;
  distance_meters?: number | null;
  rejection_reason?: string | null;
  created_at?: string;
  responded_at?: string | null;
  request: RequestBrief;
  other_ngos_notified: number;
  other_ngos_accepted: string[];
}

type Tab = "pending" | "active" | "completed" | "rejected" | "all";

function fmtTime(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(iso) ? iso : `${iso}Z`);
  return d.toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function NgoDashboard() {
  const nav = useNavigate();
  const [profile, setProfile] = useState<NgoProfile | null>(getNgo());
  const [items, setItems] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("pending");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [rejecting, setRejecting] = useState<{ id: number; reason: string } | null>(null);
  const [notice, setNotice] = useState("");

  const signOutLocal = useCallback(() => {
    clearNgo();
    setActiveRole(null);
    nav("/ngo/login");
  }, [nav]);

  const load = useCallback(async () => {
    try {
      const [me, rows] = await Promise.all([api.ngoMe(), api.ngoAssignments()]);
      const p = me as unknown as NgoProfile;
      setProfile(p);
      saveNgoSession(p);
      setItems(rows as unknown as Assignment[]);
      setError("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load";
      if (/auth/i.test(msg)) signOutLocal();
      else setError(msg);
    } finally {
      setLoading(false);
    }
  }, [signOutLocal]);

  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  const act = async (id: number, fn: () => Promise<unknown>, done: string) => {
    setBusyId(id);
    setNotice("");
    try {
      await fn();
      setNotice(done);
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  };

  const confirmReject = async () => {
    if (!rejecting) return;
    const { id, reason } = rejecting;
    setBusyId(id);
    setNotice("");
    try {
      const res = await api.ngoReject(id, reason);
      setRejecting(null);
      setNotice(
        res.alternatives_found > 0
          ? `Request declined. The control room has ${res.alternatives_found} alternative nearby NGO(s) to reassign to.`
          : "Request declined. The control room has been notified."
      );
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  };

  const toggleAvailability = async () => {
    if (!profile) return;
    const makeAvailable = profile.status === "unavailable";
    try {
      const p = (await api.ngoSetAvailability(makeAvailable)) as unknown as NgoProfile;
      setProfile(p);
      saveNgoSession(p);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not update availability");
    }
  };

  const signOut = async () => {
    await api.ngoSignout();
    signOutLocal();
  };

  const count = (st: string[]) => items.filter((a) => st.includes(a.status)).length;
  const pending = count(["offered"]);
  const accepted = count(["accepted"]);
  const onTheWay = count(["on_the_way"]);
  const completed = count(["completed"]);
  const rejected = count(["rejected"]);
  const criticalPending = items.filter((a) => a.status === "offered" && a.request.severity === "C").length;

  const filtered = items.filter((a) => {
    if (tab === "pending") return a.status === "offered";
    if (tab === "active") return a.status === "accepted" || a.status === "on_the_way";
    if (tab === "completed") return a.status === "completed";
    if (tab === "rejected") return a.status === "rejected" || a.status === "withdrawn";
    return true;
  });

  const load_ = profile?.active_load ?? 0;
  const cap = Math.max(1, profile?.capacity ?? 1);
  const loadPct = Math.min(100, Math.round((load_ / cap) * 100));

  const tile = (value: number | string, label: string, color: string) => (
    <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", padding: "0.75rem 1rem", borderRadius: "8px", boxShadow: "var(--shadow-sm)" }}>
      <div style={{ fontSize: "1.4rem", fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600 }}>{label}</div>
    </div>
  );

  return (
    <div className="app-shell" style={{ background: "#f8fafc" }}>
      <header className="gov-header">
        <div className="gov-header-inner" style={{ padding: "0.75rem 1.5rem" }}>
          <div className="gov-brand">
            <div className="gov-logo-box">
              <img src={logoSvg} alt="Sahayam" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            </div>
            <div>
              <span className="gov-title-text">SAHAYAM</span>
              <span className="gov-badge-official" style={{ marginLeft: "0.5rem" }}>NGO Response Desk</span>
            </div>
          </div>
          <button onClick={signOut} className="btn btn-sm btn-secondary" style={{ background: "#ffffff", color: "#0f172a" }}>
            Sign out
          </button>
        </div>
      </header>

      <div className="container-wide" style={{ padding: "1.25rem 1.5rem" }}>
        {/* Organization heading + availability */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem", marginBottom: "1rem" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 800, color: "var(--gov-navy)" }}>
              {profile?.unit_name || "Organization"}
            </h1>
            <p style={{ margin: "0.2rem 0 0 0", fontSize: "0.88rem", color: "var(--text-muted)" }}>
              {profile?.org_name && profile.org_name !== profile.unit_name ? `${profile.org_name} · ` : ""}
              {profile?.org_type}
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            {profile && (
              <span className={`badge badge-${TEAM_STATUS_BADGE[profile.status] || "navy"}`}>
                ● {profile.status.toUpperCase()}
              </span>
            )}
            <button onClick={toggleAvailability} className="btn btn-sm btn-secondary">
              {profile?.status === "unavailable" ? "Set Available" : "Set Unavailable"}
            </button>
            <button onClick={load} className="btn btn-sm btn-secondary">🔄 Refresh</button>
          </div>
        </div>

        {/* KPI tiles */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "0.75rem", marginBottom: "1rem" }}>
          {tile(items.length, "Assigned total", "#0f172a")}
          {tile(pending, "Pending decisions", "#d97706")}
          {tile(accepted, "Accepted", "#0284c7")}
          {tile(onTheWay, "On the way", "#1d4ed8")}
          {tile(completed, "Completed", "#16a34a")}
          {tile(rejected, "Rejected", "#e63946")}
          {tile(`${load_}/${cap}`, "Current workload", loadPct >= 100 ? "#e63946" : "#2a9d8f")}
        </div>

        {criticalPending > 0 && (
          <div style={{ background: "linear-gradient(135deg, #e63946 0%, #dc2626 100%)", color: "#ffffff", padding: "0.75rem 1.25rem", borderRadius: "8px", fontWeight: 700, fontSize: "0.9rem", marginBottom: "1rem", boxShadow: "0 4px 12px rgba(230, 57, 70, 0.25)" }}>
            🚨 {criticalPending} critical request(s) in your area are awaiting your decision
          </div>
        )}

        {notice && (
          <div style={{ padding: "0.7rem 1rem", background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: "8px", color: "#075985", fontSize: "0.88rem", marginBottom: "1rem", display: "flex", justifyContent: "space-between", gap: "1rem" }}>
            <span>{notice}</span>
            <button onClick={() => setNotice("")} style={{ background: "none", border: "none", cursor: "pointer", color: "#075985" }}>✕</button>
          </div>
        )}

        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "flex-start" }}>
          {/* Request list */}
          <div style={{ flex: "1 1 560px", minWidth: 0 }}>
            <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.85rem" }}>
              {([
                ["pending", `Pending Decisions (${pending})`],
                ["active", `Active (${accepted + onTheWay})`],
                ["completed", `Completed (${completed})`],
                ["rejected", `Rejected / Withdrawn (${rejected + count(["withdrawn"])})`],
                ["all", `All (${items.length})`],
              ] as [Tab, string][]).map(([id, label]) => (
                <button key={id} onClick={() => setTab(id)} className={`btn btn-sm ${tab === id ? "btn-primary" : "btn-secondary"}`}>
                  {label}
                </button>
              ))}
            </div>

            {loading ? (
              <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)" }}>Loading assigned requests…</div>
            ) : error ? (
              <div style={{ padding: "1rem", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "8px", color: "#b91c1c" }}>{error}</div>
            ) : filtered.length === 0 ? (
              <div className="gov-card" style={{ textAlign: "center", color: "var(--text-muted)", padding: "2.5rem" }}>
                {tab === "pending" ? "No requests awaiting your decision. New assignments appear here automatically." : "Nothing in this view yet."}
              </div>
            ) : (
              filtered.map((a) => {
                const r = a.request;
                const isCrit = r.severity === "C";
                const closed = r.status === "resolved" && a.status !== "completed";
                return (
                  <div key={a.id} className="gov-card" style={{ padding: "1rem 1.1rem", borderLeft: `4px solid ${isCrit ? "#e63946" : r.severity === "M" ? "#f4a261" : "#2a9d8f"}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: "1rem", color: "#0f172a" }}>
                          #{r.id} · {TYPE_LABELS[r.type] || r.type}
                        </div>
                        <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                          {r.track_id} · received {fmtTime(a.created_at)}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                        <span className={`badge badge-${isCrit ? "critical" : r.severity === "M" ? "warning" : "success"}`}>
                          {SEVERITY_LABELS[r.severity] || r.severity}
                        </span>
                        <span className="badge badge-navy">{a.mode === "broadcast" ? "Critical area alert" : "Direct assignment"}</span>
                        <span className={`badge badge-${ASSIGNMENT_STATUS_BADGE[a.status] || "navy"}`}>
                          {ASSIGNMENT_STATUS_LABELS[a.status] || a.status}
                        </span>
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "0.35rem 1rem", fontSize: "0.84rem", color: "#334155" }}>
                      <div>People: <strong>{r.headcount}</strong></div>
                      <div>Distance: <strong>{km(a.distance_meters)}</strong></div>
                      <div>Credibility: <strong>{r.credibility_score}/100</strong></div>
                      <div>Source: <strong>{(r.source || "app").toUpperCase()}</strong>{r.report_count > 1 ? ` · ${r.report_count} reports` : ""}</div>
                    </div>
                    <div style={{ fontSize: "0.84rem", color: "#334155", marginTop: "0.35rem" }}>
                      Location:{" "}
                      <strong>
                        {r.landmark_text || (r.latitude != null ? `${r.latitude.toFixed(4)}, ${r.longitude?.toFixed(4)}` : "—")}
                      </strong>
                      {r.latitude != null && r.longitude != null && (
                        <a
                          href={`https://www.openstreetmap.org/?mlat=${r.latitude}&mlon=${r.longitude}#map=15/${r.latitude}/${r.longitude}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{ marginLeft: "0.5rem", color: "var(--gov-blue)", fontWeight: 700 }}
                        >
                          Open map ↗
                        </a>
                      )}
                    </div>
                    {r.other_description && (
                      <div style={{ fontSize: "0.84rem", color: "#334155", marginTop: "0.25rem" }}>Details: {r.other_description}</div>
                    )}
                    {a.mode === "broadcast" && (
                      <div style={{ fontSize: "0.8rem", color: "#b45309", marginTop: "0.35rem" }}>
                        Critical alert also sent to {a.other_ngos_notified} other nearby organization(s)
                        {a.other_ngos_accepted.length > 0 ? ` · responding: ${a.other_ngos_accepted.join(", ")}` : ""}
                      </div>
                    )}
                    {a.status === "rejected" && (
                      <div style={{ fontSize: "0.82rem", color: "#b91c1c", marginTop: "0.35rem" }}>
                        You declined: {a.rejection_reason} ({fmtTime(a.responded_at)})
                      </div>
                    )}
                    {a.status === "withdrawn" && (
                      <div style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginTop: "0.35rem" }}>
                        {closed ? "Request was resolved before your response." : "Control room reassigned this request to another organization."}
                      </div>
                    )}

                    {/* Actions */}
                    {a.status === "offered" && rejecting?.id !== a.id && (
                      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.85rem", flexWrap: "wrap" }}>
                        <button
                          className="btn btn-sm btn-accent"
                          style={{ background: "#16a34a" }}
                          disabled={busyId === a.id}
                          onClick={() => act(a.id, () => api.ngoAccept(a.id), `Request #${r.id} accepted. The citizen can now see your organization.`)}
                        >
                          ✓ Accept Request
                        </button>
                        <button
                          className="btn btn-sm btn-secondary"
                          style={{ color: "#dc2626", borderColor: "#fca5a5" }}
                          disabled={busyId === a.id}
                          onClick={() => setRejecting({ id: a.id, reason: REJECT_REASONS[0] })}
                        >
                          ✕ Reject Request
                        </button>
                      </div>
                    )}
                    {rejecting?.id === a.id && (
                      <div style={{ marginTop: "0.85rem", padding: "0.75rem", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "6px" }}>
                        <label className="form-label">Reason for declining</label>
                        <select
                          className="form-control"
                          value={rejecting.reason}
                          onChange={(e) => setRejecting({ id: a.id, reason: e.target.value })}
                          style={{ marginBottom: "0.6rem" }}
                        >
                          {REJECT_REASONS.map((x) => (
                            <option key={x} value={x}>{x}</option>
                          ))}
                        </select>
                        <div style={{ display: "flex", gap: "0.5rem" }}>
                          <button className="btn btn-sm btn-emergency" disabled={busyId === a.id} onClick={confirmReject}>
                            Confirm Rejection
                          </button>
                          <button className="btn btn-sm btn-secondary" onClick={() => setRejecting(null)}>Cancel</button>
                        </div>
                      </div>
                    )}
                    {a.status === "accepted" && (
                      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.85rem", flexWrap: "wrap" }}>
                        <button className="btn btn-sm btn-primary" disabled={busyId === a.id}
                          onClick={() => act(a.id, () => api.ngoOnTheWay(a.id), `Request #${r.id}: citizen notified that your team is on the way.`)}>
                          🚚 Mark On the Way
                        </button>
                        <button className="btn btn-sm btn-secondary" style={{ color: "#16a34a", borderColor: "#86efac" }} disabled={busyId === a.id}
                          onClick={() => act(a.id, () => api.ngoComplete(a.id), `Request #${r.id} marked resolved.`)}>
                          Mark Resolved
                        </button>
                      </div>
                    )}
                    {a.status === "on_the_way" && (
                      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.85rem" }}>
                        <button className="btn btn-sm btn-accent" style={{ background: "#16a34a" }} disabled={busyId === a.id}
                          onClick={() => act(a.id, () => api.ngoComplete(a.id), `Request #${r.id} marked resolved.`)}>
                          ✓ Mark Resolved
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Organization profile */}
          <div style={{ flex: "1 1 280px", maxWidth: "380px" }}>
            <div className="gov-card">
              <div className="gov-card-header">
                <h3 className="gov-card-title">Organization Profile</h3>
              </div>
              <div style={{ marginBottom: "0.9rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem", color: "#475569", marginBottom: "0.3rem" }}>
                  <span>Workload</span>
                  <strong>{load_} of {cap} active</strong>
                </div>
                <div style={{ height: "8px", background: "#f1f5f9", borderRadius: "4px", overflow: "hidden" }}>
                  <div style={{ width: `${loadPct}%`, height: "100%", background: loadPct >= 100 ? "#e63946" : loadPct >= 67 ? "#f4a261" : "#2a9d8f" }} />
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.3rem" }}>
                  At full capacity you are marked Busy and receive no new assignments.
                </div>
              </div>
              <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--gov-navy)", marginBottom: "0.35rem" }}>Services</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem", marginBottom: "0.9rem" }}>
                {(profile?.services || []).map((s) => (
                  <span key={s} className="badge badge-info">{SERVICE_LABELS[s] || s}</span>
                ))}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", fontSize: "0.84rem", color: "#334155" }}>
                {profile?.operating_areas && <div>Operating areas: <strong>{profile.operating_areas}</strong></div>}
                {profile?.headquarters && <div>Base: <strong>{profile.headquarters}</strong></div>}
                {profile?.team_size != null && <div>Field team: <strong>{profile.team_size} people</strong></div>}
                {profile?.years_experience != null && <div>Experience: <strong>{profile.years_experience} years</strong></div>}
                <div>Contact: <strong>{profile?.contact_person}</strong></div>
                <div style={{ color: "var(--text-muted)" }}>{profile?.phone} · {profile?.email}</div>
                {profile?.registration_number && <div>Reg. no: <strong>{profile.registration_number}</strong></div>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
