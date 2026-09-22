import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../api/client";
import { loadOfflineQueue, OfflineQueuedRequest, openSmsComposer } from "../../lib/offlineQueue";
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

const SEVERITY_LABELS: Record<string, string> = {
  C: "Critical",
  M: "Medium",
  L: "Low",
};

function typeLabel(code: string) { return TYPE_LABELS[code] ?? code; }
function severityLabel(code: string) { return SEVERITY_LABELS[code] ?? code; }

interface AssignedTeamInfo {
  id: number;
  name: string;
  type: string;
  org_name?: string;
  status?: string;
}

interface RequestData {
  id: number;
  track_id?: string | null;
  type: string;
  severity: string;
  headcount: number;
  status: string;
  display_status?: string;
  credibility_score: number;
  source: string;
  assigned_team?: AssignedTeamInfo | null;
  distance_from_request_meters?: number | null;
  response_stage?: string | null;
  notified_ngo_count?: number;
  responding_teams?: AssignedTeamInfo[];
  created_at: string;
}

const TRACK_STEPS = ["Request Submitted", "NGO Dispatched", "NGO Accepted", "On the Way", "Resolved"];

interface OfflineRequest {
  id: string;
  type: string;
  severity: string;
  headcount: number;
  smsText: string;
  createdAt: string;
}

export default function CitizenTrack() {
  const { id } = useParams();
  const [requestId, setRequestId] = useState(id || "");
  const [data, setData] = useState<RequestData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [offlineQueue, setOfflineQueue] = useState<OfflineRequest[]>([]);

  useEffect(() => {
    setOfflineQueue(loadOfflineQueue() as any);
  }, []);

  const load = async (rid: string) => {
    if (!rid) return;
    setLoading(true);
    setError("");
    try {
      const isTrack = /^SAY-/i.test(rid.trim());
      const res = isTrack
        ? await api.getRequestByTrack(rid.trim())
        : await api.getRequest(rid.trim());
      setData(res as unknown as RequestData);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "Request not found");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) load(id);
  }, [id]);

  useEffect(() => {
    if (!data?.id) return;
    const t = setInterval(() => load(String(data.id)), 6000);
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.id, requestId]);

  // "On the Way" is only shown once the NGO itself has accepted and set off
  const getStepIndex = (d: RequestData | null) => {
    if (!d) return 0;
    if (d.status === "resolved") return 4;
    if (d.response_stage === "on_the_way") return 3;
    if (d.response_stage === "accepted") return 2;
    if (d.response_stage === "awaiting_response") return 1;
    return 0; // submitted / pending / verified / awaiting reassignment
  };

  const currentStep = getStepIndex(data);
  const stage = data?.response_stage;
  const otherResponders = (data?.responding_teams || []).filter((t) => t.id !== data?.assigned_team?.id);
  const showTeam = !!data?.assigned_team && stage !== "rejected";

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
        {/* Search Card */}
        <div className="gov-card">
          <div className="gov-card-header">
            <h2 className="gov-card-title">📍 Track Emergency Request</h2>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <input
              type="text"
              className="form-control"
              value={requestId}
              onChange={(e) => setRequestId(e.target.value)}
              placeholder="Track ID (e.g. SAY-2026-A3F9K2)"
            />
            <button type="button" className="btn btn-accent" onClick={() => load(requestId)}>
              Track
            </button>
          </div>
          {loading && <p style={{ fontSize: "0.85rem", color: "#0284c7", marginTop: "0.5rem" }}>Fetching status...</p>}
          {error && <p style={{ fontSize: "0.85rem", color: "#dc2626", marginTop: "0.5rem" }}>{error}</p>}
        </div>

        {/* Live Tracking Card */}
        {data && (
          <div className="gov-card">
            <div className="gov-card-header">
              <div>
                <span className="badge badge-info">Online Server Sync</span>
                <h3 style={{ margin: "0.2rem 0 0 0", fontSize: "1.1rem", fontWeight: 800, color: "#0f172a" }}>
                  {data.track_id || `Request #${data.id}`}
                </h3>
              </div>
              <span className={`badge badge-${data.status === "resolved" ? "success" : data.status === "dispatched" ? "info" : "warning"}`}>
                {data.display_status || data.status}
              </span>
            </div>

            {/* Stepper Timeline */}
            <div className="stepper-container" style={{ margin: "1.5rem 0" }}>
              {TRACK_STEPS.map((stepLabel, idx) => {
                const isDone = idx <= currentStep;
                const isCurrent = idx === currentStep;
                return (
                  <div key={stepLabel} className="stepper-step">
                    <div className={`stepper-circle ${isDone ? (isCurrent ? "active" : "completed") : ""}`}>
                      {isDone ? (isCurrent ? "➔" : "✓") : idx + 1}
                    </div>
                    <div className={`stepper-label ${isDone ? "active" : ""}`}>{stepLabel}</div>
                  </div>
                );
              })}
            </div>

            {/* Request Summary Details */}
            <div style={{ background: "#f8fafc", padding: "1rem", borderRadius: "8px", border: "1px solid #e2e8f0", marginBottom: "1.2rem", fontSize: "0.9rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.4rem" }}>
                <span style={{ color: "#64748b" }}>Assistance Required:</span>
                <strong style={{ color: "#0f172a" }}>{typeLabel(data.type)}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.4rem" }}>
                <span style={{ color: "#64748b" }}>Severity:</span>
                <strong style={{ color: data.severity === "C" ? "#dc2626" : "#d97706" }}>
                  {severityLabel(data.severity)} ({data.headcount} people)
                </strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#64748b" }}>Credibility Index:</span>
                <strong style={{ color: "#16a34a" }}>{data.credibility_score}/100</strong>
              </div>
            </div>

            {/* Assigned Relief Organization Details */}
            <div style={{ padding: "1rem", background: showTeam ? "#f0f9ff" : "#f8fafc", border: showTeam ? "1px solid #7dd3fc" : "1px dashed #cbd5e1", borderRadius: "8px" }}>
              <div style={{ fontSize: "0.8rem", textTransform: "uppercase", fontWeight: 800, color: showTeam ? "#0284c7" : "#64748b", marginBottom: "0.3rem" }}>
                🤝 Assigned Response Organization
              </div>
              {showTeam && data.assigned_team ? (
                <div>
                  <div style={{ fontWeight: 800, fontSize: "1.05rem", color: "#0f172a" }}>
                    {data.assigned_team.name}
                  </div>
                  {data.assigned_team.org_name && data.assigned_team.org_name !== data.assigned_team.name && (
                    <div style={{ fontSize: "0.82rem", color: "#475569" }}>
                      Organization: {data.assigned_team.org_name}
                    </div>
                  )}
                  <div style={{ fontSize: "0.85rem", color: stage === "awaiting_response" ? "#d97706" : "#16a34a", fontWeight: 700, marginTop: "0.3rem" }}>
                    {data.status === "resolved"
                      ? "Request resolved by this organization"
                      : stage === "on_the_way"
                      ? "NGO On the Way"
                      : stage === "accepted"
                      ? "Request Accepted — team is preparing to move"
                      : "NGO Dispatched — awaiting confirmation from the organization"}
                    {data.status !== "resolved" && data.distance_from_request_meters != null &&
                      ` (~ ${(data.distance_from_request_meters / 1000).toFixed(1)} km away)`}
                  </div>
                  {otherResponders.length > 0 && (
                    <div style={{ fontSize: "0.8rem", color: "#475569", marginTop: "0.3rem" }}>
                      Also responding: {otherResponders.map((t) => t.name).join(", ")}
                    </div>
                  )}
                </div>
              ) : stage === "awaiting_response" ? (
                <div style={{ fontSize: "0.85rem", color: "#b45309", fontWeight: 600 }}>
                  Critical alert sent to {data.notified_ngo_count || "nearby"} relief organization(s) in your area — waiting for the first to accept.
                </div>
              ) : stage === "rejected" ? (
                <div style={{ fontSize: "0.85rem", color: "#64748b" }}>
                  The first organization could not take this request. The control room is assigning another nearby NGO.
                </div>
              ) : (
                <div style={{ fontSize: "0.85rem", color: "#64748b" }}>
                  Admin is assessing spatial proximity to assign the nearest available relief organization.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Offline Saved Queue */}
        {offlineQueue.length > 0 && (
          <div className="gov-card" style={{ borderLeft: "4px solid #d97706", background: "#fffbeb" }}>
            <div className="gov-card-header">
              <h3 className="gov-card-title" style={{ color: "#b45309" }}>📱 Offline queue</h3>
            </div>
            <p style={{ fontSize: "0.82rem", color: "#475569", marginBottom: "0.75rem" }}>
              Stored on this device only. Track ID is assigned after the SMS reaches Sahayam.
            </p>
            {offlineQueue.map((oq, idx) => (
              <div key={idx} style={{ background: "#ffffff", padding: "0.75rem", borderRadius: "6px", border: "1px solid #fde68a", marginBottom: "0.5rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", fontWeight: 700 }}>
                  <span style={{ color: "#d97706" }}>{typeLabel(oq.type)}</span>
                  <span style={{ color: "#64748b", fontSize: "0.75rem" }}>{(oq as any).status || "Pending Transmission"}</span>
                </div>
                <code style={{ display: "block", background: "#0f172a", color: "#86efac", padding: "0.4rem", borderRadius: "4px", fontSize: "0.78rem", marginTop: "0.3rem" }}>
                  {oq.smsText}
                </code>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
