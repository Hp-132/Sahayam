import { useState, useEffect } from "react";
import { api } from "../../api/client";

interface DashboardStats {
  total_requests: number;
  pending_requests: number;
  verified_requests: number;
  dispatched_requests: number;
  resolved_requests: number;
  critical_requests: number;
  medium_requests: number;
  low_requests: number;
  sms_requests: number;
  app_requests: number;
  average_credibility: number;
  available_teams: number;
  busy_teams: number;
  active_disaster_zones: number;
}

interface RequestItem {
  type: string;
  severity: string;
  status: string;
  source: string;
}

export default function AdminAnalytics() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [typeCounts, setTypeCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const [dashRes, reqsRes] = await Promise.all([
        api.adminDashboard(),
        api.adminRequests(),
      ]);
      setStats(dashRes as unknown as DashboardStats);

      const reqs = reqsRes as unknown as RequestItem[];
      const tc: Record<string, number> = {};
      for (const r of reqs) {
        tc[r.type] = (tc[r.type] || 0) + 1;
      }
      setTypeCounts(tc);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div style={{ padding: "1.5rem" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 800, color: "var(--gov-navy)" }}>
            📊 Operational Analytics & Metrics
          </h1>
          <p style={{ margin: "0.2rem 0 0 0", fontSize: "0.88rem", color: "var(--text-muted)" }}>
            Real-time PostGIS telemetry, severity distribution, and response analytics
          </p>
        </div>
        <button onClick={loadData} className="btn btn-secondary btn-sm">
          🔄 Refresh Metrics
        </button>
      </div>

      {loading ? (
        <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)" }}>Loading analytics telemetry...</div>
      ) : error ? (
        <div style={{ padding: "1rem", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "8px", color: "#b91c1c" }}>
          {error}
        </div>
      ) : stats ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {/* Top Overview Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
            <div className="gov-card" style={{ margin: 0, padding: "1.1rem" }}>
              <div style={{ fontSize: "1.8rem", fontWeight: 900, color: "var(--gov-navy)" }}>{stats.total_requests}</div>
              <div style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>Total Emergency Submissions</div>
            </div>
            <div className="gov-card" style={{ margin: 0, padding: "1.1rem", borderLeft: "4px solid #dc2626" }}>
              <div style={{ fontSize: "1.8rem", fontWeight: 900, color: "#dc2626" }}>{stats.critical_requests}</div>
              <div style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>Critical Severity (Level C)</div>
            </div>
            <div className="gov-card" style={{ margin: 0, padding: "1.1rem", borderLeft: "4px solid #16a34a" }}>
              <div style={{ fontSize: "1.8rem", fontWeight: 900, color: "#16a34a" }}>{stats.average_credibility} / 100</div>
              <div style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>Average Credibility Index</div>
            </div>
            <div className="gov-card" style={{ margin: 0, padding: "1.1rem", borderLeft: "4px solid #7e22ce" }}>
              <div style={{ fontSize: "1.8rem", fontWeight: 900, color: "#7e22ce" }}>{stats.active_disaster_zones}</div>
              <div style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>Active Disaster Geofence Zones</div>
            </div>
          </div>

          {/* Grid 2: Severity & Source Breakdowns */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem" }}>
            {/* Severity Distribution */}
            <div className="gov-card" style={{ margin: 0 }}>
              <div className="gov-card-header">
                <h3 className="gov-card-title">Severity Level Breakdown</h3>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.88rem", marginBottom: "0.2rem" }}>
                    <span style={{ color: "#dc2626", fontWeight: 700 }}>Critical (Level C)</span>
                    <span>{stats.critical_requests} ({Math.round((stats.critical_requests / (stats.total_requests || 1)) * 100)}%)</span>
                  </div>
                  <div style={{ width: "100%", height: "8px", background: "#f1f5f9", borderRadius: "4px", overflow: "hidden" }}>
                    <div style={{ width: `${(stats.critical_requests / (stats.total_requests || 1)) * 100}%`, height: "100%", background: "#dc2626" }}></div>
                  </div>
                </div>

                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.88rem", marginBottom: "0.2rem" }}>
                    <span style={{ color: "#d97706", fontWeight: 700 }}>Medium (Level M)</span>
                    <span>{stats.medium_requests} ({Math.round((stats.medium_requests / (stats.total_requests || 1)) * 100)}%)</span>
                  </div>
                  <div style={{ width: "100%", height: "8px", background: "#f1f5f9", borderRadius: "4px", overflow: "hidden" }}>
                    <div style={{ width: `${(stats.medium_requests / (stats.total_requests || 1)) * 100}%`, height: "100%", background: "#d97706" }}></div>
                  </div>
                </div>

                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.88rem", marginBottom: "0.2rem" }}>
                    <span style={{ color: "#16a34a", fontWeight: 700 }}>Low (Level L)</span>
                    <span>{stats.low_requests} ({Math.round((stats.low_requests / (stats.total_requests || 1)) * 100)}%)</span>
                  </div>
                  <div style={{ width: "100%", height: "8px", background: "#f1f5f9", borderRadius: "4px", overflow: "hidden" }}>
                    <div style={{ width: `${(stats.low_requests / (stats.total_requests || 1)) * 100}%`, height: "100%", background: "#16a34a" }}></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Ingestion Source: Web App vs Offline DR1 SMS */}
            <div className="gov-card" style={{ margin: 0 }}>
              <div className="gov-card-header">
                <h3 className="gov-card-title">Ingestion Telemetry (App vs SMS)</h3>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.88rem", marginBottom: "0.2rem" }}>
                    <span style={{ color: "#1d4ed8", fontWeight: 700 }}>🌐 Web Application (Online)</span>
                    <span>{stats.app_requests} submissions</span>
                  </div>
                  <div style={{ width: "100%", height: "8px", background: "#f1f5f9", borderRadius: "4px", overflow: "hidden" }}>
                    <div style={{ width: `${(stats.app_requests / (stats.total_requests || 1)) * 100}%`, height: "100%", background: "#1d4ed8" }}></div>
                  </div>
                </div>

                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.88rem", marginBottom: "0.2rem" }}>
                    <span style={{ color: "#7e22ce", fontWeight: 700 }}>📱 DR1 SMS Webhook (Offline Fallback)</span>
                    <span>{stats.sms_requests} submissions</span>
                  </div>
                  <div style={{ width: "100%", height: "8px", background: "#f1f5f9", borderRadius: "4px", overflow: "hidden" }}>
                    <div style={{ width: `${(stats.sms_requests / (stats.total_requests || 1)) * 100}%`, height: "100%", background: "#7e22ce" }}></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Emergency Assistance Types Breakdown */}
          <div className="gov-card" style={{ margin: 0 }}>
            <div className="gov-card-header">
              <h3 className="gov-card-title">Emergency Assistance Types Breakdown</h3>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "0.8rem" }}>
              {Object.entries(typeCounts).map(([typeKey, count]) => (
                <div key={typeKey} style={{ background: "#f8fafc", padding: "0.8rem", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                  <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>{typeKey}</div>
                  <div style={{ fontSize: "1.3rem", fontWeight: 900, color: "var(--gov-navy)" }}>{count}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
