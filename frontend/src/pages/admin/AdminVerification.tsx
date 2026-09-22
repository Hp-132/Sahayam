import { useState, useEffect } from "react";
import { api } from "../../api/client";

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

interface RequestItem {
  id: number;
  type: string;
  severity: string;
  headcount: number;
  status: string;
  credibility_score: number;
  source: string;
  created_at: string;
}

interface DuplicateInfo {
  is_duplicate: boolean;
  matched_request_id?: number;
  similarity?: number;
  distance_meters?: number;
}

interface ContextInfo {
  inside_disaster_zone?: boolean;
  zone_name?: string;
}

export default function AdminVerification() {
  const [queue, setQueue] = useState<RequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedReq, setSelectedReq] = useState<RequestItem | null>(null);
  const [duplicateSignal, setDuplicateSignal] = useState<DuplicateInfo | null>(null);
  const [contextSignal, setContextSignal] = useState<ContextInfo | null>(null);
  const [loadingSignals, setLoadingSignals] = useState(false);

  const loadQueue = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.adminRequests();
      const all = res as unknown as RequestItem[];
      const needingVer = all.filter((r) => r.status === "pending" || r.credibility_score < 60);
      setQueue(needingVer);
      if (needingVer.length > 0 && !selectedReq) {
        selectRequest(needingVer[0]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load verification queue");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQueue();
  }, []);

  const selectRequest = async (req: RequestItem) => {
    setSelectedReq(req);
    setDuplicateSignal(null);
    setContextSignal(null);
    setLoadingSignals(true);
    try {
      const [dupRes, ctxRes] = await Promise.all([
        api.requestDuplicates(req.id),
        api.requestLocationContext(req.id),
      ]);
      setDuplicateSignal(dupRes as unknown as DuplicateInfo);
      setContextSignal(ctxRes as unknown as ContextInfo);
    } catch {
      /* ignore */
    } finally {
      setLoadingSignals(false);
    }
  };

  const handleVerify = async (id: number) => {
    try {
      await api.adminVerify(id, 1);
      await loadQueue();
    } catch (e) {
      alert("Verification failed: " + (e instanceof Error ? e.message : "Unknown error"));
    }
  };

  return (
    <div style={{ padding: "1.5rem" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 800, color: "var(--gov-navy)" }}>
            🔍 Verification Queue & Credibility Signals
          </h1>
          <p style={{ margin: "0.2rem 0 0 0", fontSize: "0.88rem", color: "var(--text-muted)" }}>
            Review spatial geofence plausibility, credibility score diagnostics, and RapidFuzz duplicate matches
          </p>
        </div>
        <button onClick={loadQueue} className="btn btn-secondary btn-sm">
          🔄 Refresh Queue
        </button>
      </div>

      {loading ? (
        <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)" }}>Loading verification queue...</div>
      ) : error ? (
        <div style={{ padding: "1rem", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "8px", color: "#b91c1c" }}>
          {error}
        </div>
      ) : queue.length === 0 ? (
        <div className="gov-card" style={{ textAlign: "center", color: "#16a34a", padding: "3rem", borderLeft: "4px solid #16a34a" }}>
          ✅ All incoming emergency submissions verified!
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: "1.25rem" }}>
          {/* Left Column: Queue Items List */}
          <div className="gov-card" style={{ padding: "1rem", margin: 0, maxHeight: "72vh", overflowY: "auto" }}>
            <div style={{ fontSize: "0.82rem", fontWeight: 800, color: "var(--gov-navy)", textTransform: "uppercase", marginBottom: "0.75rem" }}>
              Verification Required ({queue.length})
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              {queue.map((r) => {
                const isSelected = selectedReq?.id === r.id;
                return (
                  <div
                    key={r.id}
                    onClick={() => selectRequest(r)}
                    style={{
                      padding: "0.85rem",
                      borderRadius: "6px",
                      background: isSelected ? "#f0f9ff" : "#ffffff",
                      border: isSelected ? "2px solid #1d4ed8" : "1px solid #e2e8f0",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.3rem" }}>
                      <span style={{ fontWeight: 800, color: "var(--gov-navy)", fontSize: "0.95rem" }}>
                        #{r.id} · {TYPE_LABELS[r.type] || r.type}
                      </span>
                      <span className={`badge badge-${r.severity === "C" ? "critical" : "warning"}`}>
                        {r.severity}
                      </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                      <span>Source: {r.source.toUpperCase()}</span>
                      <span style={{ color: r.credibility_score < 50 ? "#dc2626" : "#d97706", fontWeight: 700 }}>
                        Credibility: {r.credibility_score}/100
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Verification Diagnostics */}
          {selectedReq && (
            <div className="gov-card" style={{ margin: 0 }}>
              <div className="gov-card-header">
                <div>
                  <h3 className="gov-card-title">Verification Signals for Request #{selectedReq.id}</h3>
                  <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
                    Type: <strong>{TYPE_LABELS[selectedReq.type] || selectedReq.type}</strong> | Headcount: <strong>{selectedReq.headcount} person(s)</strong>
                  </div>
                </div>

                <button onClick={() => handleVerify(selectedReq.id)} className="btn btn-accent">
                  ✓ Verify Request
                </button>
              </div>

              {loadingSignals ? (
                <div style={{ padding: "2rem", color: "var(--text-muted)" }}>Evaluating RapidFuzz & PostGIS verification signals...</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
                  {/* Signal 1: Credibility Score Engine */}
                  <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "1.1rem" }}>
                    <div style={{ fontSize: "0.8rem", textTransform: "uppercase", fontWeight: 800, color: "var(--gov-navy)", marginBottom: "0.4rem" }}>
                      📊 Credibility Score Engine
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                      <div style={{ fontSize: "2.2rem", fontWeight: 900, color: selectedReq.credibility_score < 50 ? "#dc2626" : "#d97706" }}>
                        {selectedReq.credibility_score}/100
                      </div>
                      <div style={{ fontSize: "0.88rem", color: "#334155" }}>
                        {selectedReq.credibility_score < 50 ? (
                          <span style={{ color: "#dc2626", fontWeight: 700 }}>Low Credibility</span>
                        ) : (
                          <span style={{ color: "#d97706", fontWeight: 700 }}>Verification Required</span>
                        )}
                        <div>Deterministic rule evaluation based on location accuracy, spatial boundary matching, and report corroboration.</div>
                      </div>
                    </div>
                  </div>

                  {/* Signal 2: RapidFuzz Duplicate Detection */}
                  <div style={{ background: duplicateSignal?.is_duplicate ? "#fffbeb" : "#f0fdf4", border: duplicateSignal?.is_duplicate ? "1px solid #fde68a" : "1px solid #86efac", borderRadius: "8px", padding: "1.1rem" }}>
                    <div style={{ fontSize: "0.8rem", textTransform: "uppercase", fontWeight: 800, color: duplicateSignal?.is_duplicate ? "#d97706" : "#16a34a", marginBottom: "0.4rem" }}>
                      ⚡ RapidFuzz Duplicate Detection Signal
                    </div>
                    {duplicateSignal?.is_duplicate ? (
                      <div>
                        <div style={{ fontWeight: 800, color: "#d97706", fontSize: "0.95rem", marginBottom: "0.2rem" }}>
                          ⚠️ Possible Duplicate
                        </div>
                        <div style={{ fontSize: "0.88rem", color: "#334155" }}>
                          Matches existing Request <strong>#{duplicateSignal.matched_request_id}</strong> with <strong>{duplicateSignal.similarity}% text similarity</strong> within <strong>{duplicateSignal.distance_meters} meters</strong> proximity.
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: "0.88rem", color: "#16a34a", fontWeight: 600 }}>
                        ✓ No duplicate emergency reports detected nearby.
                      </div>
                    )}
                  </div>

                  {/* Signal 3: PostGIS Geofence Context */}
                  <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "1.1rem" }}>
                    <div style={{ fontSize: "0.8rem", textTransform: "uppercase", fontWeight: 800, color: "#0284c7", marginBottom: "0.4rem" }}>
                      🗺 PostGIS Geofence Boundary Check
                    </div>
                    <div style={{ fontSize: "0.88rem", color: "#334155" }}>
                      <div>
                        Disaster Zone Status: <strong>{contextSignal?.inside_disaster_zone ? `Inside ${contextSignal.zone_name}` : "Outside active zones"}</strong>
                      </div>
                      <div style={{ marginTop: "0.2rem", color: "#64748b" }}>
                        Source: <strong>{selectedReq.source.toUpperCase()}</strong> | GPS coordinate location validation
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
