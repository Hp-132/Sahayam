import { useState, useEffect } from "react";
import { api } from "../../api/client";
import { SERVICE_LABELS, STAGE_LABELS, TEAM_STATUS_BADGE } from "../../lib/ngo";

interface TeamItem {
  id: number;
  name: string;
  type: string;
  org_name?: string;
  status: string;
  latitude?: number;
  longitude?: number;
  services?: string[];
  capacity?: number;
  active_load?: number;
  self_registered?: boolean;
  profile?: {
    org_type: string;
    contact_person: string;
    phone: string;
    email: string;
    registration_number?: string | null;
    years_experience?: number | null;
    operating_areas?: string | null;
    headquarters?: string | null;
    team_size?: number | null;
  } | null;
}

interface RequestItem {
  id: number;
  type: string;
  severity: string;
  status: string;
  headcount: number;
  assigned_team_id?: number | null;
  response_stage?: string | null;
  created_at: string;
}

export default function AdminOrganizations() {
  const [teams, setTeams] = useState<TeamItem[]>([]);
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedTeam, setSelectedTeam] = useState<TeamItem | null>(null);

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      const [teamsRes, reqsRes] = await Promise.all([
        api.listTeams(),
        api.adminRequests(),
      ]);
      setTeams(teamsRes as unknown as TeamItem[]);
      setRequests(reqsRes as unknown as RequestItem[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load organizations");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // newly registered NGOs and availability changes show up without a manual refresh
    const t = setInterval(() => loadData(true), 20_000);
    return () => clearInterval(t);
  }, []);

  const availableCount = teams.filter((t) => t.status?.toLowerCase() === "available").length;
  const busyCount = teams.filter((t) => t.status?.toLowerCase() === "busy").length;
  const unavailableCount = teams.filter((t) => t.status?.toLowerCase() === "unavailable").length;
  const registeredCount = teams.filter((t) => t.self_registered).length;
  const activeAssignments = requests.filter((r) => r.assigned_team_id != null && r.status !== "resolved").length;

  const filteredTeams = teams.filter((t) => {
    if (statusFilter === "available" && t.status?.toLowerCase() !== "available") return false;
    if (statusFilter === "busy" && t.status?.toLowerCase() !== "busy") return false;
    if (statusFilter === "unavailable" && t.status?.toLowerCase() !== "unavailable") return false;
    if (statusFilter === "registered" && !t.self_registered) return false;
    return true;
  });

  const getAssignedRequests = (teamId: number) => {
    return requests.filter((r) => r.assigned_team_id === teamId);
  };

  return (
    <div style={{ padding: "1.5rem" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 800, color: "var(--gov-navy)" }}>
            🤝 NGO & Relief Organizations Directory
          </h1>
          <p style={{ margin: "0.2rem 0 0 0", fontSize: "0.88rem", color: "var(--text-muted)" }}>
            Operational response units and NGO deployment telemetry across disaster zones
          </p>
        </div>
        <button onClick={() => loadData()} className="btn btn-secondary btn-sm">
          🔄 Refresh Directory
        </button>
      </div>

      {/* KPI Stats Bar */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
        <div className="gov-card" style={{ margin: 0, padding: "1.1rem" }}>
          <div style={{ fontSize: "1.8rem", fontWeight: 900, color: "var(--gov-navy)" }}>{teams.length}</div>
          <div style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>Total NGO Response Units</div>
        </div>
        <div className="gov-card" style={{ margin: 0, padding: "1.1rem", borderLeft: "4px solid #16a34a" }}>
          <div style={{ fontSize: "1.8rem", fontWeight: 900, color: "#16a34a" }}>{availableCount}</div>
          <div style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>Available Units</div>
        </div>
        <div className="gov-card" style={{ margin: 0, padding: "1.1rem", borderLeft: "4px solid #7e22ce" }}>
          <div style={{ fontSize: "1.8rem", fontWeight: 900, color: "#7e22ce" }}>{busyCount}</div>
          <div style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>Busy (at capacity)</div>
        </div>
        <div className="gov-card" style={{ margin: 0, padding: "1.1rem", borderLeft: "4px solid #64748b" }}>
          <div style={{ fontSize: "1.8rem", fontWeight: 900, color: "#475569" }}>{unavailableCount}</div>
          <div style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>Unavailable</div>
        </div>
        <div className="gov-card" style={{ margin: 0, padding: "1.1rem", borderLeft: "4px solid #0284c7" }}>
          <div style={{ fontSize: "1.8rem", fontWeight: 900, color: "#0284c7" }}>{activeAssignments}</div>
          <div style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>Active Assignments</div>
        </div>
      </div>

      {/* Filter Pills */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.2rem" }}>
        {["all", "available", "busy", "unavailable", "registered"].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`btn btn-sm ${statusFilter === s ? "btn-primary" : "btn-secondary"}`}
            style={{ textTransform: "capitalize" }}
          >
            {s === "all" ? "All Statuses" : s === "registered" ? `Self-registered (${registeredCount})` : s}
          </button>
        ))}
      </div>

      {/* Directory Grid */}
      {loading ? (
        <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)" }}>Loading organization directory...</div>
      ) : error ? (
        <div style={{ padding: "1rem", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "8px", color: "#b91c1c" }}>
          {error}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "1rem" }}>
          {filteredTeams.map((t) => {
            const isAvailable = t.status?.toLowerCase() === "available";
            const teamReqs = getAssignedRequests(t.id);
            return (
              <div
                key={t.id}
                className="gov-card"
                onClick={() => setSelectedTeam(t)}
                style={{ margin: 0, cursor: "pointer" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.4rem" }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 800, color: "#0f172a" }}>{t.name}</h3>
                    <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.1rem" }}>
                      {t.self_registered
                        ? `${t.profile?.org_type || "Registered organization"} · Self-registered`
                        : `${t.org_name || "Disaster Response Unit"} (Simulated Unit)`}
                    </div>
                  </div>
                  <span className={`badge badge-${isAvailable ? "success" : TEAM_STATUS_BADGE[t.status?.toLowerCase()] || "navy"}`}>
                    ● {t.status?.toUpperCase()}
                  </span>
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem", marginTop: "0.5rem" }}>
                  {(t.services || [t.type]).map((s) => (
                    <span key={s} className="badge badge-info">{SERVICE_LABELS[s] || s}</span>
                  ))}
                </div>
                {t.capacity != null && (
                  <div style={{ fontSize: "0.82rem", color: "#334155", marginTop: "0.45rem" }}>
                    Workload: <strong>{t.active_load ?? 0}/{t.capacity}</strong> active
                  </div>
                )}

                <div style={{ marginTop: "0.75rem", paddingTop: "0.6rem", borderTop: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.82rem" }}>
                  <span style={{ color: "var(--text-muted)" }}>
                    Assigned Requests: <strong style={{ color: "var(--gov-navy)" }}>{teamReqs.length}</strong>
                  </span>
                  <span style={{ color: "var(--gov-blue)", fontWeight: 700 }}>
                    View details →
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Selected Team Requests Drawer Modal */}
      {selectedTeam && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(15,23,42,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000, padding: "1rem" }}>
          <div className="gov-card" style={{ maxWidth: "520px", width: "100%", margin: 0, boxShadow: "var(--shadow-lg)" }}>
            <div className="gov-card-header">
              <div>
                <h3 className="gov-card-title">{selectedTeam.name}</h3>
                <div style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
                  {selectedTeam.org_name}{selectedTeam.self_registered ? " · Self-registered" : " (Simulated Unit)"}
                </div>
              </div>
              <button onClick={() => setSelectedTeam(null)} style={{ background: "none", border: "none", fontSize: "1.2rem", cursor: "pointer", color: "var(--text-muted)" }}>✕</button>
            </div>

            {selectedTeam.profile && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.3rem 1rem", fontSize: "0.84rem", color: "#334155", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "6px", padding: "0.75rem", marginBottom: "1rem" }}>
                <div>Type: <strong>{selectedTeam.profile.org_type}</strong></div>
                <div>Status: <strong style={{ textTransform: "capitalize" }}>{selectedTeam.status}</strong> · {selectedTeam.active_load ?? 0}/{selectedTeam.capacity} active</div>
                <div>Contact: <strong>{selectedTeam.profile.contact_person}</strong></div>
                <div>Phone: <strong>{selectedTeam.profile.phone}</strong></div>
                <div style={{ gridColumn: "1 / -1" }}>Email: <strong>{selectedTeam.profile.email}</strong></div>
                {selectedTeam.profile.registration_number && <div>Reg. no: <strong>{selectedTeam.profile.registration_number}</strong></div>}
                {selectedTeam.profile.years_experience != null && <div>Experience: <strong>{selectedTeam.profile.years_experience} yrs</strong></div>}
                {selectedTeam.profile.team_size != null && <div>Field team: <strong>{selectedTeam.profile.team_size}</strong></div>}
                {selectedTeam.profile.operating_areas && <div style={{ gridColumn: "1 / -1" }}>Areas: <strong>{selectedTeam.profile.operating_areas}</strong></div>}
                {selectedTeam.profile.headquarters && <div style={{ gridColumn: "1 / -1" }}>Base: <strong>{selectedTeam.profile.headquarters}</strong></div>}
                <div style={{ gridColumn: "1 / -1", display: "flex", flexWrap: "wrap", gap: "0.3rem" }}>
                  {(selectedTeam.services || []).map((s) => (
                    <span key={s} className="badge badge-info">{SERVICE_LABELS[s] || s}</span>
                  ))}
                </div>
              </div>
            )}

            <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--gov-navy)", marginBottom: "0.5rem" }}>
              Active Assigned Requests ({getAssignedRequests(selectedTeam.id).length}):
            </div>

            <div style={{ maxHeight: "240px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {getAssignedRequests(selectedTeam.id).length === 0 ? (
                <div style={{ color: "var(--text-muted)", fontSize: "0.85rem", padding: "1rem", textAlign: "center", background: "#f8fafc", borderRadius: "6px" }}>
                  No active requests currently assigned to this unit.
                </div>
              ) : (
                getAssignedRequests(selectedTeam.id).map((r) => (
                  <div key={r.id} style={{ background: "#f8fafc", padding: "0.75rem", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.88rem", fontWeight: 700 }}>
                      <span style={{ color: "var(--gov-navy)" }}>Request #{r.id} · {r.type}</span>
                      <span className={`badge badge-${r.status === "resolved" ? "success" : "warning"}`}>
                        {r.status !== "resolved" && r.response_stage ? STAGE_LABELS[r.response_stage] || r.status : r.status}
                      </span>
                    </div>
                    <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
                      Severity: {r.severity} | Headcount: {r.headcount} person(s)
                    </div>
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
