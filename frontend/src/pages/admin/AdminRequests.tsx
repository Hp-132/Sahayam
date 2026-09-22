import { useState, useEffect } from "react";
import { api } from "../../api/client";
import {
  SERVICE_LABELS, ASSIGNMENT_STATUS_LABELS, ASSIGNMENT_STATUS_BADGE, STAGE_LABELS, km,
} from "../../lib/ngo";

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
const STATUS_LABELS: Record<string, string> = {
  pending: "Pending Verification",
  verified: "Verified",
  dispatched: "NGO Dispatched",
  resolved: "Resolved",
};
const REFRESH_MS = 15_000;

interface CoordAssignment {
  id: number;
  team_id: number;
  team_name: string;
  org_name?: string;
  mode: "direct" | "broadcast";
  status: string;
  distance_meters?: number | null;
  rejection_reason?: string | null;
  created_at?: string;
  responded_at?: string | null;
}

interface CoordCandidate {
  team_id: number;
  team_name: string;
  org_name?: string;
  services: string[];
  distance_meters: number;
  active_load: number;
  capacity: number;
}

interface Coordination {
  display_status: string;
  is_critical: boolean;
  required_services: string[];
  current_assignment: CoordAssignment | null;
  history: CoordAssignment[];
  rejection_count: number;
  broadcast_count: number;
  alternatives: CoordCandidate[];
  recommended: CoordCandidate | null;
}

interface RequestItem {
  id: number;
  type: string;
  severity: string;
  headcount: number;
  status: string;
  display_status?: string;
  credibility_score: number;
  source: string;
  latitude?: number;
  longitude?: number;
  assigned_team_id?: number | null;
  assigned_team?: { id: number; name: string; type: string; org_name?: string; status?: string } | null;
  response_stage?: string | null;
  rejection_count?: number;
  open_offer_count?: number;
  created_at: string;
}

interface TeamItem {
  id: number;
  name: string;
  type: string;
  org_name?: string;
  status: string;
  latitude?: number;
  longitude?: number;
}

export default function AdminRequests() {
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [teams, setTeams] = useState<TeamItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [assignModalReq, setAssignModalReq] = useState<RequestItem | null>(null);
  const [coord, setCoord] = useState<Coordination | null>(null);
  const [loadingCoord, setLoadingCoord] = useState(false);
  const [coordMsg, setCoordMsg] = useState("");

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      const [reqRes, teamRes] = await Promise.all([
        api.adminRequests(),
        api.listTeams(),
      ]);
      setRequests(reqRes as unknown as RequestItem[]);
      setTeams(teamRes as unknown as TeamItem[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load requests");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // new citizen requests and NGO accept / reject decisions appear without a manual refresh
    const t = setInterval(() => loadData(true), REFRESH_MS);
    return () => clearInterval(t);
  }, []);

  const handleVerify = async (id: number) => {
    try {
      await api.adminVerify(id, 1);
      await loadData();
    } catch (e) {
      alert("Verification failed: " + (e instanceof Error ? e.message : "Unknown error"));
    }
  };

  const handleResolve = async (id: number) => {
    try {
      await api.adminResolve(id);
      await loadData();
    } catch (e) {
      alert("Resolution failed: " + (e instanceof Error ? e.message : "Unknown error"));
    }
  };

  const loadCoordination = async (reqId: number) => {
    setLoadingCoord(true);
    try {
      setCoord((await api.adminCoordination(reqId)) as unknown as Coordination);
    } catch {
      setCoord(null);
    } finally {
      setLoadingCoord(false);
    }
  };

  const openAssignModal = async (req: RequestItem) => {
    setAssignModalReq(req);
    setCoord(null);
    setCoordMsg("");
    await loadCoordination(req.id);
  };

  const confirmAssign = async (reqId: number, teamId: number) => {
    try {
      if (coord?.current_assignment) await api.adminReassign(reqId, teamId);
      else await api.adminAssign(reqId, teamId);
      setAssignModalReq(null);
      await loadData(true);
    } catch (e) {
      alert("Assignment failed: " + (e instanceof Error ? e.message : "Unknown error"));
    }
  };

  const broadcast = async (reqId: number) => {
    try {
      const res = await api.adminBroadcast(reqId);
      setCoordMsg(
        res.ngos_notified > 0
          ? `Critical alert sent to ${res.ngos_notified} suitable NGO(s) in the area.`
          : "No further suitable NGOs found in the area."
      );
      await Promise.all([loadCoordination(reqId), loadData(true)]);
    } catch (e) {
      setCoordMsg(e instanceof Error ? e.message : "Broadcast failed");
    }
  };

  const filtered = requests.filter((r) => {
    if (activeTab === "pending" && r.status !== "pending") return false;
    if (activeTab === "critical" && r.severity !== "C") return false;
    if (activeTab === "unassigned" && r.assigned_team_id) return false;
    if (activeTab === "assigned" && !r.assigned_team_id) return false;
    if (activeTab === "resolved" && r.status !== "resolved") return false;
    if (activeTab === "reassign" && r.response_stage !== "rejected") return false;
    if (activeTab === "awaiting" && r.response_stage !== "awaiting_response") return false;

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const matchId = String(r.id).includes(q);
      const matchType = (TYPE_LABELS[r.type] || r.type).toLowerCase().includes(q);
      const matchSource = r.source.toLowerCase().includes(q);
      return matchId || matchType || matchSource;
    }

    return true;
  });

  const availableTeams = teams.filter((t) => t.status?.toLowerCase() === "available");

  return (
    <div style={{ padding: "1.5rem" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 800, color: "var(--gov-navy)" }}>
            🚨 Emergency Requests Management
          </h1>
          <p style={{ margin: "0.2rem 0 0 0", fontSize: "0.88rem", color: "var(--text-muted)" }}>
            Real-time citizen submissions, spatial verification & organization assignments
          </p>
        </div>
        <button onClick={() => loadData()} className="btn btn-secondary btn-sm">
          🔄 Refresh Data
        </button>
      </div>

      {/* Tabs & Search Filter */}
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", justifyContent: "space-between", marginBottom: "1.2rem" }}>
        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
          {[
            { id: "all", label: `All (${requests.length})` },
            { id: "pending", label: `Pending Verification (${requests.filter(r => r.status === "pending").length})` },
            { id: "critical", label: `Critical (${requests.filter(r => r.severity === "C").length})` },
            { id: "unassigned", label: `Unassigned (${requests.filter(r => !r.assigned_team_id).length})` },
            { id: "assigned", label: `Assigned (${requests.filter(r => !!r.assigned_team_id).length})` },
            { id: "awaiting", label: `Awaiting NGO (${requests.filter(r => r.response_stage === "awaiting_response").length})` },
            { id: "reassign", label: `Needs Reassignment (${requests.filter(r => r.response_stage === "rejected").length})` },
            { id: "resolved", label: `Resolved (${requests.filter(r => r.status === "resolved").length})` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`btn btn-sm ${activeTab === tab.id ? "btn-primary" : "btn-secondary"}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <input
          type="text"
          className="form-control"
          placeholder="Search ID, type or source..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ width: "260px", padding: "0.4rem 0.8rem", fontSize: "0.85rem" }}
        />
      </div>

      {/* Main Operational Table */}
      {loading ? (
        <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)" }}>Loading requests from database...</div>
      ) : error ? (
        <div style={{ padding: "1rem", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "8px", color: "#b91c1c" }}>
          {error}
        </div>
      ) : filtered.length === 0 ? (
        <div className="gov-card" style={{ textAlign: "center", color: "var(--text-muted)", padding: "3rem" }}>
          No requests match current operational filter.
        </div>
      ) : (
        <div className="gov-table-container">
          <table className="gov-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Assistance Type</th>
                <th>Severity</th>
                <th>Headcount</th>
                <th>Source</th>
                <th>Credibility</th>
                <th>Assigned Organization</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 800, color: "var(--gov-navy)" }}>#{r.id}</td>
                  <td style={{ fontWeight: 600 }}>{TYPE_LABELS[r.type] || r.type}</td>
                  <td>
                    <span className={`badge badge-${r.severity === "C" ? "critical" : r.severity === "M" ? "warning" : "success"}`}>
                      {SEVERITY_LABELS[r.severity] || r.severity}
                    </span>
                  </td>
                  <td>{r.headcount} person(s)</td>
                  <td>
                    <span className="badge badge-navy">
                      {r.source.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ fontWeight: 800, color: r.credibility_score >= 70 ? "#16a34a" : r.credibility_score >= 40 ? "#d97706" : "#dc2626" }}>
                    {r.credibility_score}/100
                  </td>
                  <td>
                    {r.assigned_team ? (
                      <div>
                        <div style={{ fontWeight: 700, color: "var(--gov-navy)" }}>{r.assigned_team.name}</div>
                        <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>{r.assigned_team.org_name || r.assigned_team.type}</div>
                      </div>
                    ) : r.response_stage === "awaiting_response" && (r.open_offer_count || 0) > 0 ? (
                      <span style={{ color: "#b45309", fontWeight: 600, fontSize: "0.82rem" }}>
                        Critical alert · {r.open_offer_count} NGO(s) notified
                      </span>
                    ) : (
                      <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>Unassigned</span>
                    )}
                    {(r.rejection_count || 0) > 0 && (
                      <div style={{ fontSize: "0.75rem", color: "#dc2626", fontWeight: 700, marginTop: "0.15rem" }}>
                        ⚠ {r.rejection_count} rejection(s)
                      </div>
                    )}
                  </td>
                  <td>
                    <span className={`badge badge-${r.status === "resolved" ? "success" : r.response_stage === "rejected" ? "critical" : r.status === "dispatched" ? "info" : r.status === "verified" ? "navy" : "warning"}`}>
                      {r.status !== "resolved" && r.response_stage && STAGE_LABELS[r.response_stage]
                        ? STAGE_LABELS[r.response_stage]
                        : STATUS_LABELS[r.status] || r.status}
                    </span>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <div style={{ display: "flex", gap: "0.4rem", justifyContent: "flex-end" }}>
                      {r.status === "pending" && (
                        <button onClick={() => handleVerify(r.id)} className="btn btn-sm btn-accent" style={{ background: "#7e22ce" }}>
                          Verify
                        </button>
                      )}
                      {r.status !== "resolved" && (
                        <button
                          onClick={() => openAssignModal(r)}
                          className={`btn btn-sm ${r.response_stage === "rejected" ? "btn-emergency" : "btn-accent"}`}
                        >
                          {r.response_stage === "rejected" ? "Reassign" : r.assigned_team_id ? "Reassign Org" : "Assign Org"}
                        </button>
                      )}
                      {r.status !== "resolved" && (
                        <button onClick={() => handleResolve(r.id)} className="btn btn-sm btn-secondary" style={{ color: "#16a34a", borderColor: "#86efac" }}>
                          Resolve
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Assign Organization PostGIS Modal */}
      {assignModalReq && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(15,23,42,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000, padding: "1rem" }}>
          <div className="gov-card" style={{ maxWidth: "680px", width: "100%", maxHeight: "90vh", overflowY: "auto", margin: 0, boxShadow: "var(--shadow-lg)" }}>
            <div className="gov-card-header">
              <h3 className="gov-card-title">NGO Coordination · Request #{assignModalReq.id}</h3>
              <button onClick={() => setAssignModalReq(null)} style={{ background: "none", border: "none", fontSize: "1.2rem", cursor: "pointer", color: "var(--text-muted)" }}>✕</button>
            </div>

            <p style={{ fontSize: "0.88rem", color: "var(--text-muted)", marginBottom: "1rem" }}>
              Help Type: <strong>{TYPE_LABELS[assignModalReq.type] || assignModalReq.type}</strong> | Severity: <strong>{SEVERITY_LABELS[assignModalReq.severity] || assignModalReq.severity}</strong>
              {coord && <> | Status: <strong>{coord.display_status}</strong></>}
              {coord && coord.required_services.length > 0 && (
                <> | Needs: <strong>{coord.required_services.map((s) => SERVICE_LABELS[s] || s).join(" / ")}</strong></>
              )}
            </p>

            {loadingCoord && !coord && (
              <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "1rem" }}>Calculating PostGIS spatial proximity...</div>
            )}

            {coord && (
              <>
                {/* Current assignment */}
                <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "0.85rem 1rem", marginBottom: "1rem" }}>
                  <div style={{ fontSize: "0.8rem", textTransform: "uppercase", fontWeight: 800, color: "var(--gov-navy)", marginBottom: "0.3rem" }}>
                    Current Assignment
                  </div>
                  {coord.current_assignment ? (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                      <div>
                        <div style={{ fontWeight: 800, color: "#0f172a" }}>{coord.current_assignment.team_name}</div>
                        <div style={{ fontSize: "0.8rem", color: "#475569" }}>
                          {coord.current_assignment.mode === "broadcast" ? "Accepted critical alert" : "Direct assignment"} · {km(coord.current_assignment.distance_meters)}
                        </div>
                      </div>
                      <span className={`badge badge-${ASSIGNMENT_STATUS_BADGE[coord.current_assignment.status] || "navy"}`}>
                        {ASSIGNMENT_STATUS_LABELS[coord.current_assignment.status] || coord.current_assignment.status}
                      </span>
                    </div>
                  ) : (
                    <div style={{ fontSize: "0.85rem", color: coord.rejection_count > 0 ? "#dc2626" : "var(--text-muted)", fontWeight: coord.rejection_count > 0 ? 700 : 400 }}>
                      {coord.rejection_count > 0
                        ? "Rejected by the assigned NGO — select an alternative below and confirm the reassignment."
                        : coord.history.some((h) => h.status === "offered")
                        ? "Critical alert is open — waiting for a notified NGO to accept."
                        : "No NGO assigned yet."}
                    </div>
                  )}
                </div>

                {/* Critical broadcast */}
                {coord.is_critical && (
                  <div style={{ background: "#fff1f2", border: "1px solid #fecdd3", borderRadius: "8px", padding: "0.85rem 1rem", marginBottom: "1rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                      <div>
                        <div style={{ fontSize: "0.8rem", textTransform: "uppercase", fontWeight: 800, color: "#e63946" }}>
                          🚨 Critical Area Broadcast
                        </div>
                        <div style={{ fontSize: "0.82rem", color: "#475569", marginTop: "0.2rem" }}>
                          {coord.broadcast_count > 0
                            ? `Forwarded to ${coord.broadcast_count} suitable NGO(s) in the affected area; each can accept or reject.`
                            : "Forward to every suitable NGO in the affected area (not distant organizations)."}
                        </div>
                      </div>
                      {coord.alternatives.length > 0 && (
                        <button onClick={() => broadcast(assignModalReq.id)} className="btn btn-sm btn-emergency">
                          {coord.broadcast_count > 0 ? "Alert Remaining Nearby NGOs" : "Broadcast to Nearby NGOs"}
                        </button>
                      )}
                    </div>
                    {coordMsg && <div style={{ fontSize: "0.82rem", color: "#b91c1c", fontWeight: 600, marginTop: "0.4rem" }}>{coordMsg}</div>}
                  </div>
                )}

                {/* Ranked alternatives */}
                <div style={{ background: "#f0f9ff", border: "1px solid #7dd3fc", borderRadius: "8px", padding: "1rem", marginBottom: "1rem" }}>
                  <div style={{ fontSize: "0.8rem", textTransform: "uppercase", fontWeight: 800, color: "#0284c7", marginBottom: "0.5rem" }}>
                    📍 {coord.rejection_count > 0 ? "Alternative Nearby NGOs" : "Suitable Nearby NGOs"} (PostGIS ST_Distance · capability · workload)
                  </div>
                  {coord.alternatives.length === 0 ? (
                    <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                      No suitable NGO remains within range. Use the manual list below if needed.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                      {coord.alternatives.map((c, i) => (
                        <div key={c.team_id} style={{ background: "#ffffff", border: `1px solid ${i === 0 ? "#7dd3fc" : "#e2e8f0"}`, borderRadius: "6px", padding: "0.65rem 0.75rem", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 800, fontSize: "0.92rem", color: "#0f172a" }}>
                              {c.team_name}
                              {i === 0 && <span className="badge badge-info" style={{ marginLeft: "0.4rem" }}>Recommended</span>}
                            </div>
                            <div style={{ fontSize: "0.78rem", color: "#475569" }}>
                              {km(c.distance_meters)} · workload {c.active_load}/{c.capacity} · {c.services.map((s) => SERVICE_LABELS[s] || s).join(", ")}
                            </div>
                          </div>
                          <button onClick={() => confirmAssign(assignModalReq.id, c.team_id)} className={`btn btn-sm ${i === 0 ? "btn-accent" : "btn-secondary"}`} style={{ whiteSpace: "nowrap" }}>
                            {coord.current_assignment || coord.rejection_count > 0 ? "Reassign" : "Confirm Assignment"}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Assignment / rejection history */}
                {coord.history.length > 0 && (
                  <div style={{ marginBottom: "1rem" }}>
                    <div style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--gov-navy)", marginBottom: "0.5rem" }}>
                      Assignment History ({coord.history.length}{coord.rejection_count > 0 ? ` · ${coord.rejection_count} rejected` : ""})
                    </div>
                    <div className="gov-table-container">
                      <table className="gov-table">
                        <thead>
                          <tr>
                            <th>Organization</th>
                            <th>Mode</th>
                            <th>Response</th>
                            <th>Reason</th>
                          </tr>
                        </thead>
                        <tbody>
                          {coord.history.map((h) => (
                            <tr key={h.id}>
                              <td style={{ fontWeight: 700 }}>{h.team_name}</td>
                              <td>{h.mode === "broadcast" ? "Critical alert" : "Direct"}</td>
                              <td>
                                <span className={`badge badge-${ASSIGNMENT_STATUS_BADGE[h.status] || "navy"}`}>
                                  {ASSIGNMENT_STATUS_LABELS[h.status] || h.status}
                                </span>
                              </td>
                              <td style={{ fontSize: "0.8rem", color: h.status === "rejected" ? "#b91c1c" : "var(--text-muted)" }}>
                                {h.rejection_reason || "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Available NGO List */}
            <div style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--gov-navy)", marginBottom: "0.5rem" }}>
              Manual Override — All Available Organizations:
            </div>
            <div style={{ maxHeight: "200px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {availableTeams.length === 0 ? (
                <div style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>No available organizations.</div>
              ) : (
                availableTeams.map((t) => (
                  <div key={t.id} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", padding: "0.75rem", borderRadius: "6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 700, color: "#0f172a", fontSize: "0.9rem" }}>{t.name}</div>
                      <div style={{ fontSize: "0.78rem", color: "#64748b" }}>{t.org_name || t.type}</div>
                    </div>
                    <button onClick={() => confirmAssign(assignModalReq.id, t.id)} className="btn btn-sm btn-secondary">
                      Assign
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
