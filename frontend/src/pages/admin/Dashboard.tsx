import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useNavigate, useLocation } from "react-router-dom";
import maplibregl from "maplibre-gl";
import { api } from "../../api/client";
import { logoutAdmin, switchRole } from "../../lib/session";
import logoSvg from "../../assets/logo.svg";

import AdminRequests from "./AdminRequests";
import AdminVerification from "./AdminVerification";
import AdminOrganizations from "./AdminOrganizations";
import AdminAnalytics from "./AdminAnalytics";

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
  pending: "Pending",
  verified: "Verified",
  dispatched: "Help Arriving",
  resolved: "Resolved",
};
const SOURCE_LABELS: Record<string, string> = { app: "App", sms: "SMS" };

function tL(code: string) { return TYPE_LABELS[code] ?? code; }
function sL(code: string) { return SEVERITY_LABELS[code] ?? code; }
function stL(code: string){ return STATUS_LABELS[code] ?? code; }
function srcL(code: string){ return SOURCE_LABELS[code] ?? code; }

const REFRESH_MS = 30_000;
const MAP_CENTER: [number, number] = [74.5, 15.0];
const MAP_ZOOM = 5;

type Req = Record<string, unknown>;

interface Filters {
  severity: string;
  type: string;
  status: string;
  source: string;
  assigned: string;
  criticalUnassigned: boolean;
}

const DEFAULT_FILTERS: Filters = {
  severity: "", type: "", status: "", source: "", assigned: "", criticalUnassigned: false,
};

function applyFilters(reqs: Req[], f: Filters): Req[] {
  return reqs.filter((r) => {
    if (f.criticalUnassigned) {
      return (
        String(r.severity) === "C" &&
        String(r.status) === "pending" &&
        !r.assigned_team_id
      );
    }
    if (f.severity && String(r.severity) !== f.severity) return false;
    if (f.type && String(r.type) !== f.type) return false;
    if (f.status && String(r.status) !== f.status) return false;
    if (f.source && String(r.source) !== f.source) return false;
    if (f.assigned === "yes" && !r.assigned_team_id) return false;
    if (f.assigned === "no" && r.assigned_team_id) return false;
    return true;
  });
}

function reqsToGeoJSON(reqs: Req[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const r of reqs) {
    const lat = r.latitude as number | null;
    const lng = r.longitude as number | null;
    if (lat == null || lng == null) continue;
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [lng, lat] },
      properties: {
        id: r.id,
        type: r.type,
        severity: r.severity,
        status: r.status,
        credibility_score: r.credibility_score,
        headcount: r.headcount,
        source: r.source,
        assigned_team_id: r.assigned_team_id ?? null,
        display_status: r.display_status ?? r.status,
      },
    });
  }
  return { type: "FeatureCollection", features };
}

export default function AdminDashboard() {
  const nav = useNavigate();
  const location = useLocation();

  const getNavFromPath = (path: string) => {
    if (path.includes("/requests")) return "requests";
    if (path.includes("/verification")) return "verification";
    if (path.includes("/organizations")) return "organizations";
    if (path.includes("/analytics")) return "analytics";
    return "command-center";
  };

  const [activeNav, setActiveNav] = useState<string>(getNavFromPath(location.pathname));
  const [activeTab, setActiveTab] = useState<"map" | "list">("map");

  useEffect(() => {
    setActiveNav(getNavFromPath(location.pathname));
  }, [location.pathname]);

  const handleNavClick = (target: string) => {
    setActiveNav(target);
    if (target === "command-center") nav("/admin");
    else nav(`/admin/${target}`);
  };

  const [stats, setStats] = useState<Record<string, number> | null>(null);
  const [allReqs, setAllReqs] = useState<Req[]>([]);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const [layerVis, setLayerVis] = useState({
    requests: true,
    heatmap: true,
    zones: true,
    teams: true,
    facilities: true,
  });

  const heatGeoRef = useRef<GeoJSON.FeatureCollection>({ type: "FeatureCollection", features: [] });
  const zonesGeoRef = useRef<GeoJSON.FeatureCollection>({ type: "FeatureCollection", features: [] });
  const teamsGeoRef = useRef<GeoJSON.FeatureCollection>({ type: "FeatureCollection", features: [] });
  const facsGeoRef = useRef<GeoJSON.FeatureCollection>({ type: "FeatureCollection", features: [] });

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const mapReadyRef = useRef(false);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const isMountedRef = useRef(true);

  const filtered = applyFilters(allReqs, filters);
  // Latest values for the one-time map "load" handler (avoids stale closure)
  const allReqsRef = useRef(allReqs);
  const filtersRef = useRef(filters);
  allReqsRef.current = allReqs;
  filtersRef.current = filters;

  const updateMapSources = useCallback((reqsData: Req[], filterState: Filters) => {
    if (!mapRef.current || !mapReadyRef.current) return;
    const m = mapRef.current;
    try {
      if (m.getSource("heatmap")) (m.getSource("heatmap") as maplibregl.GeoJSONSource).setData(heatGeoRef.current);
      if (m.getSource("zones")) (m.getSource("zones") as maplibregl.GeoJSONSource).setData(zonesGeoRef.current);
      if (m.getSource("teams")) (m.getSource("teams") as maplibregl.GeoJSONSource).setData(teamsGeoRef.current);
      if (m.getSource("facilities")) (m.getSource("facilities") as maplibregl.GeoJSONSource).setData(facsGeoRef.current);
      if (m.getSource("requests")) (m.getSource("requests") as maplibregl.GeoJSONSource).setData(reqsToGeoJSON(applyFilters(reqsData, filterState)));
    } catch (_) {}
  }, []);

  // Initial Load (once on mount): fetch static map data (zones, facilities, teams) + initial operational data
  useEffect(() => {
    isMountedRef.current = true;

    const fetchInitialData = async () => {
      try {
        const [dash, reqs, heat, zones, teams, facs] = await Promise.all([
          api.adminDashboard(),
          api.adminRequests({ limit: "1000" }),
          api.mapHeatmap(),
          api.mapZones(),
          api.mapTeams(),
          api.mapFacilities(),
        ]);
        if (!isMountedRef.current) return;

        setStats(dash as Record<string, number>);
        setAllReqs(reqs as Req[]);

        heatGeoRef.current = heat as GeoJSON.FeatureCollection;
        zonesGeoRef.current = zones as GeoJSON.FeatureCollection;
        teamsGeoRef.current = teams as GeoJSON.FeatureCollection;
        facsGeoRef.current = facs as GeoJSON.FeatureCollection;

        if (mapRef.current && mapReadyRef.current) {
          updateMapSources(reqs as Req[], DEFAULT_FILTERS);
        }
      } catch (_) {
        // ignore
      }
    };

    fetchInitialData();

    return () => {
      isMountedRef.current = false;
    };
  }, [updateMapSources]);

  // Periodic Operational Refresh (30 seconds): fetch live requests, dashboard stats, and heatmap
  useEffect(() => {
    const fetchOperationalData = async () => {
      try {
        const [dash, reqs, heat] = await Promise.all([
          api.adminDashboard(),
          api.adminRequests({ limit: "1000" }),
          api.mapHeatmap(),
        ]);
        if (!isMountedRef.current) return;

        setStats(dash as Record<string, number>);
        setAllReqs(reqs as Req[]);
        heatGeoRef.current = heat as GeoJSON.FeatureCollection;

        if (mapRef.current && mapReadyRef.current) {
          updateMapSources(reqs as Req[], filters);
        }
      } catch (_) {
        // ignore
      }
    };

    const interval = setInterval(fetchOperationalData, REFRESH_MS);
    return () => clearInterval(interval);
  }, [filters, updateMapSources]);

  // Update map requests source when filtered items change
  useEffect(() => {
    if (!mapReadyRef.current || !mapRef.current) return;
    const map = mapRef.current;
    if (map.getSource("requests")) {
      (map.getSource("requests") as maplibregl.GeoJSONSource).setData(reqsToGeoJSON(filtered));
    }
  }, [filtered]);

  // Update layer visibility
  useEffect(() => {
    if (!mapReadyRef.current || !mapRef.current) return;
    const map = mapRef.current;
    const vis = (v: boolean) => (v ? "visible" : "none");

    const layerMap: Record<string, string[]> = {
      requests: ["req-clusters", "req-cluster-count", "req-unclustered"],
      heatmap: ["heat"],
      zones: ["zones-fill", "zones-line"],
      teams: ["team-available", "team-busy"],
      facilities: ["facility-points"],
    };

    for (const [key, ids] of Object.entries(layerMap)) {
      for (const id of ids) {
        if (map.getLayer(id)) {
          map.setLayoutProperty(id, "visibility", vis(layerVis[key as keyof typeof layerVis]));
        }
      }
    }
  }, [layerVis]);

  // Handle map resize when tab switches back to command center map
  useEffect(() => {
    if (activeNav === "command-center" && activeTab === "map" && mapRef.current) {
      setTimeout(() => {
        mapRef.current?.resize();
      }, 100);
    }
  }, [activeNav, activeTab]);

  // Single MapLibre instance lifecycle
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: {
        version: 8,
        glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution: "© OpenStreetMap",
          },
        },
        layers: [{ id: "osm", type: "raster", source: "osm" }],
      },
      center: MAP_CENTER,
      zoom: MAP_ZOOM,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.addControl(new maplibregl.FullscreenControl(), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");

    mapRef.current = map;

    map.on("load", () => {
      // 2. zones-fill & 3. zones-line
      if (!map.getSource("zones")) {
        map.addSource("zones", { type: "geojson", data: zonesGeoRef.current });
      }
      if (!map.getLayer("zones-fill")) {
        map.addLayer({
          id: "zones-fill", type: "fill", source: "zones",
          paint: { "fill-color": "#f59e0b", "fill-opacity": 0.07 },
        });
      }
      if (!map.getLayer("zones-line")) {
        map.addLayer({
          id: "zones-line", type: "line", source: "zones",
          paint: { "line-color": "#f59e0b", "line-width": 1.5, "line-dasharray": [5, 4] },
        });
      }

      // 4. heat (Vibrant Teal-Green-Yellow-Amber-Red Heatmap gradient as specified)
      if (!map.getSource("heatmap")) {
        map.addSource("heatmap", { type: "geojson", data: heatGeoRef.current });
      }
      if (!map.getLayer("heat")) {
        map.addLayer({
          id: "heat", type: "heatmap", source: "heatmap",
          paint: {
            "heatmap-weight": ["get", "weight"],
            "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 3, 20, 5, 28, 7, 42, 9, 42, 11, 32, 14, 24],
            "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 3, 0.5, 6, 0.9, 9, 1.3, 13, 1.7],
            "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 3, 0.80, 7, 0.82, 10, 0.75, 13, 0.65, 16, 0.50],
            "heatmap-color": [
              "interpolate", ["linear"], ["heatmap-density"],
              // Anchored to the severity palette: Low teal → Medium amber → Critical red
              0.00, "rgba(0,0,0,0)",
              0.08, "rgba(42,157,143,0)",
              0.20, "rgba(42,157,143,0.60)",
              0.38, "rgba(74,195,95,0.72)",
              0.55, "rgba(233,196,20,0.82)",
              0.72, "rgba(244,162,97,0.88)",
              0.88, "rgba(230,57,70,0.93)",
              1.00, "rgba(185,28,28,0.96)"
            ],
          },
        });
      }

      // 5. req-clusters & 6. req-cluster-count & 7. req-unclustered
      if (!map.getSource("requests")) {
        map.addSource("requests", {
          type: "geojson",
          data: reqsToGeoJSON(applyFilters(allReqsRef.current, filtersRef.current)),
          cluster: true,
          clusterMaxZoom: 11,
          clusterRadius: 30,
        });
      }

      if (!map.getLayer("req-clusters")) {
        map.addLayer({
          id: "req-clusters", type: "circle", source: "requests",
          filter: ["has", "point_count"],
          paint: {
            "circle-radius": 14,
            "circle-color": "#234e52",
            "circle-stroke-width": 1.5,
            "circle-stroke-color": "#ffffff",
          },
        });
      }

      if (!map.getLayer("req-cluster-count")) {
        map.addLayer({
          id: "req-cluster-count", type: "symbol", source: "requests",
          filter: ["has", "point_count"],
          layout: {
            "text-field": ["get", "point_count_abbreviated"],
            "text-size": 11,
            "text-font": ["Noto Sans Bold"],
          },
          paint: { "text-color": "#ffffff" },
        });
      }

      if (!map.getLayer("req-unclustered")) {
        map.addLayer({
          id: "req-unclustered", type: "symbol", source: "requests",
          filter: ["!", ["has", "point_count"]],
          layout: {
            "text-field": "▼",
            "text-size": 16,
            "text-font": ["Noto Sans Regular"],
            "text-allow-overlap": true,
          },
          paint: {
            "text-color": [
              "match", ["get", "severity"],
              "C", "#e63946",
              "M", "#f4a261",
              "L", "#2a9d8f",
              "#0f172a",
            ],
          },
        });
      }

      // Cluster click -> expand zoom
      map.on("click", "req-clusters", (e) => {
        const features = map.queryRenderedFeatures(e.point, { layers: ["req-clusters"] });
        if (!features.length) return;
        const clusterId = features[0].properties.cluster_id as number;
        (map.getSource("requests") as maplibregl.GeoJSONSource)
          .getClusterExpansionZoom(clusterId)
          .then((zoom) => {
            const coords = (features[0].geometry as GeoJSON.Point).coordinates as [number, number];
            map.easeTo({ center: coords, zoom });
          })
          .catch(() => {});
      });

      // Individual request click -> fly to & popup
      map.on("click", "req-unclustered", (e) => {
        const feat = e.features?.[0];
        if (!feat) return;
        const p = feat.properties as Record<string, unknown>;
        const reqId = Number(p.id);
        setSelectedId(reqId);

        const coords = (feat.geometry as GeoJSON.Point).coordinates as [number, number];
        map.flyTo({ center: coords, zoom: 12 });

        const isCritUnassigned = String(p.severity) === "C" && String(p.status) === "pending" && !p.assigned_team_id;

        if (popupRef.current) popupRef.current.remove();
        popupRef.current = new maplibregl.Popup({ closeButton: true })
          .setLngLat(coords)
          .setHTML(`
            <div class="map-popup">
              <div class="map-popup-header ${p.severity === "C" ? "sev-c" : p.severity === "M" ? "sev-m" : "sev-l"}">
                <strong>#${p.id} · ${tL(String(p.type))}</strong>
              </div>
              <div class="map-popup-body">
                <div><span class="mp-label">Severity</span><span>${sL(String(p.severity))}</span></div>
                <div><span class="mp-label">Status</span><span>${stL(String(p.status))}</span></div>
                <div><span class="mp-label">People</span><span>${p.headcount}</span></div>
                <div><span class="mp-label">Source</span><span>${srcL(String(p.source))}</span></div>
                <div><span class="mp-label">Credibility</span><span>${p.credibility_score}/100</span></div>
                <div><span class="mp-label">Team</span><span>${p.assigned_team_id ? "Assigned" : "Unassigned"}</span></div>
                ${isCritUnassigned ? '<div class="mp-urgent">⚠️ Critical · Unassigned</div>' : ''}
              </div>
            </div>`)
          .addTo(map);
      });

      // 8. team-available & 9. team-busy
      if (!map.getSource("teams")) {
        map.addSource("teams", { type: "geojson", data: teamsGeoRef.current });
      }
      if (!map.getLayer("team-available")) {
        map.addLayer({
          id: "team-available", type: "symbol", source: "teams",
          filter: ["==", ["get", "status"], "available"],
          layout: { "text-field": "▲", "text-size": 15, "text-font": ["Noto Sans Regular"] },
          paint: { "text-color": "#38bdf8" },
        });
      }
      if (!map.getLayer("team-busy")) {
        map.addLayer({
          id: "team-busy", type: "symbol", source: "teams",
          filter: ["==", ["get", "status"], "busy"],
          layout: { "text-field": "▲", "text-size": 15, "text-font": ["Noto Sans Regular"] },
          paint: { "text-color": "#a78bfa" },
        });
      }

      // 10. facility-points
      if (!map.getSource("facilities")) {
        map.addSource("facilities", { type: "geojson", data: facsGeoRef.current });
      }
      if (!map.getLayer("facility-points")) {
        map.addLayer({
          id: "facility-points", type: "symbol", source: "facilities",
          layout: { "text-field": "✚", "text-size": 12, "text-font": ["Noto Sans Regular"] },
          paint: {
            "text-color": [
              "match", ["get", "type"],
              "hospital", "#d864f6",
              "clinic", "#c084fc",
              "shelter", "#34d399",
              "camp", "#fbbf24",
              "#38bdf8"
            ]
          },
        });
      }

      mapReadyRef.current = true;
      updateMapSources(allReqsRef.current, filtersRef.current);
    });

    return () => {
      mapReadyRef.current = false;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const selectRequestOnMap = (r: Req) => {
    const lat = r.latitude as number | null;
    const lng = r.longitude as number | null;
    if (lat == null || lng == null) return;
    setSelectedId(Number(r.id));

    if (mapRef.current) {
      const map = mapRef.current;
      map.flyTo({ center: [lng, lat], zoom: 12 });

      const isCritUnassigned = String(r.severity) === "C" && String(r.status) === "pending" && !r.assigned_team_id;

      if (popupRef.current) popupRef.current.remove();
      popupRef.current = new maplibregl.Popup({ closeButton: true })
        .setLngLat([lng, lat])
        .setHTML(`
          <div class="map-popup">
            <div class="map-popup-header ${r.severity === "C" ? "sev-c" : r.severity === "M" ? "sev-m" : "sev-l"}">
              <strong>#${String(r.id)} · ${tL(String(r.type))}</strong>
            </div>
            <div class="map-popup-body">
              <div><span class="mp-label">Severity</span><span>${sL(String(r.severity))}</span></div>
              <div><span class="mp-label">Status</span><span>${stL(String(r.status))}</span></div>
              <div><span class="mp-label">People</span><span>${r.headcount}</span></div>
              <div><span class="mp-label">Source</span><span>${srcL(String(r.source))}</span></div>
              <div><span class="mp-label">Credibility</span><span>${r.credibility_score}/100</span></div>
              <div><span class="mp-label">Team</span><span>${r.assigned_team_id ? "Assigned" : "Unassigned"}</span></div>
              ${isCritUnassigned ? '<div class="mp-urgent">⚠️ Critical · Unassigned</div>' : ''}
            </div>
          </div>`)
        .addTo(map);
    }
  };

  const critUnassignedCount = allReqs.filter(
    (r) => r.severity === "C" && r.status === "pending" && !r.assigned_team_id
  ).length;

  return (
    <div className="app-shell" style={{ background: "#f8fafc" }}>
      {/* 1. TOPBAR - Clean Navbar */}
      <header className="gov-header">
        <div className="gov-header-inner" style={{ padding: "0.75rem 1.5rem" }}>
          <div className="gov-brand">
            <div className="gov-logo-box">
              <img src={logoSvg} alt="Sahayam" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            </div>
            <div>
              <span className="gov-title-text">SAHAYAM</span>
              <span className="gov-badge-official" style={{ marginLeft: "0.5rem" }}>Admin Command Center</span>
            </div>
          </div>

          <div className="gov-nav">
            <button
              onClick={() => handleNavClick("command-center")}
              className={`gov-nav-link ${activeNav === "command-center" ? "active" : ""}`}
            >
              🗺 Command Center
            </button>
            <button
              onClick={() => handleNavClick("requests")}
              className={`gov-nav-link ${activeNav === "requests" ? "active" : ""}`}
            >
              🚨 Requests
            </button>
            <button
              onClick={() => handleNavClick("verification")}
              className={`gov-nav-link ${activeNav === "verification" ? "active" : ""}`}
            >
              🔍 Verification
            </button>
            <button
              onClick={() => handleNavClick("organizations")}
              className={`gov-nav-link ${activeNav === "organizations" ? "active" : ""}`}
            >
              🤝 Organizations
            </button>
            <button
              onClick={() => handleNavClick("analytics")}
              className={`gov-nav-link ${activeNav === "analytics" ? "active" : ""}`}
            >
              📊 Analytics
            </button>
            <button
              onClick={() => { logoutAdmin(); switchRole(); nav("/"); }}
              className="btn btn-sm btn-secondary"
              style={{ background: "#ffffff", color: "#0f172a", marginLeft: "0.5rem" }}
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Render Sub-pages */}
      {activeNav === "requests" && <AdminRequests />}
      {activeNav === "verification" && <AdminVerification />}
      {activeNav === "organizations" && <AdminOrganizations />}
      {activeNav === "analytics" && <AdminAnalytics />}

      {/* Command Center View */}
      <div style={{ display: activeNav === "command-center" ? "block" : "none" }}>
        <div className="container-wide" style={{ padding: "1.25rem 1.5rem" }}>
          
          {/* 2. STATS BAR - 8 Stat Tiles */}
          {stats && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "0.75rem", marginBottom: "1rem" }}>
              <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", padding: "0.75rem 1rem", borderRadius: "8px", boxShadow: "var(--shadow-sm)" }}>
                <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#0f172a" }}>{stats.total_requests}</div>
                <div style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600 }}>Total</div>
              </div>
              <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", padding: "0.75rem 1rem", borderRadius: "8px", boxShadow: "var(--shadow-sm)" }}>
                <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#d97706" }}>{stats.pending_requests}</div>
                <div style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600 }}>Pending</div>
              </div>
              <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", padding: "0.75rem 1rem", borderRadius: "8px", boxShadow: "var(--shadow-sm)" }}>
                <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#0284c7" }}>{stats.dispatched_requests}</div>
                <div style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600 }}>Dispatched</div>
              </div>
              <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", padding: "0.75rem 1rem", borderRadius: "8px", boxShadow: "var(--shadow-sm)" }}>
                <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#16a34a" }}>{stats.resolved_requests}</div>
                <div style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600 }}>Resolved</div>
              </div>
              <div style={{ background: "#fff1f2", border: "1px solid #fecdd3", padding: "0.75rem 1rem", borderRadius: "8px", boxShadow: "var(--shadow-sm)" }}>
                <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#e63946" }}>{stats.critical_requests}</div>
                <div style={{ fontSize: "0.75rem", color: "#e63946", fontWeight: 700 }}>Critical</div>
              </div>
              <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", padding: "0.75rem 1rem", borderRadius: "8px", boxShadow: "var(--shadow-sm)" }}>
                <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#2a9d8f" }}>{stats.available_teams ?? 0}</div>
                <div style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600 }}>Teams free</div>
              </div>
              <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", padding: "0.75rem 1rem", borderRadius: "8px", boxShadow: "var(--shadow-sm)" }}>
                <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#a78bfa" }}>{stats.busy_teams ?? 0}</div>
                <div style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600 }}>Teams busy</div>
              </div>
              <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", padding: "0.75rem 1rem", borderRadius: "8px", boxShadow: "var(--shadow-sm)" }}>
                <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#ea580c" }}>{stats.active_disaster_zones ?? 0}</div>
                <div style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600 }}>Active zones</div>
              </div>
            </div>
          )}

          {/* 3. CRITICAL UNASSIGNED ALERT BANNER */}
          {critUnassignedCount > 0 && (
            <div style={{ marginBottom: "1rem" }}>
              <button
                onClick={() =>
                  setFilters({ ...filters, criticalUnassigned: !filters.criticalUnassigned })
                }
                style={{
                  width: "100%",
                  background: filters.criticalUnassigned ? "#b91c1c" : "linear-gradient(135deg, #e63946 0%, #dc2626 100%)",
                  color: "#ffffff",
                  border: "none",
                  padding: "0.75rem 1.25rem",
                  borderRadius: "8px",
                  fontWeight: 700,
                  fontSize: "0.9rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  cursor: "pointer",
                  boxShadow: "0 4px 12px rgba(230, 57, 70, 0.25)",
                }}
              >
                <span>🚨 ATTENTION: {critUnassignedCount} Critical Emergency Request(s) Pending Assignment</span>
                <span style={{ fontSize: "0.82rem", background: "rgba(255,255,255,0.2)", padding: "0.2rem 0.6rem", borderRadius: "4px" }}>
                  {filters.criticalUnassigned ? "Showing Critical Only (Click to Reset)" : "Click to Filter Critical"}
                </span>
              </button>
            </div>
          )}

          {/* 4. FILTERS ROW */}
          <div
            style={{
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "8px",
              padding: "0.85rem 1.25rem",
              marginBottom: "1rem",
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
              flexWrap: "wrap",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <select
              value={filters.severity}
              onChange={(e) => setFilters({ ...filters, severity: e.target.value, criticalUnassigned: false })}
              className="form-control"
              style={{ width: "auto", fontSize: "0.85rem", padding: "0.45rem 0.75rem" }}
            >
              <option value="">All Severities</option>
              <option value="C">Critical (C)</option>
              <option value="M">Medium (M)</option>
              <option value="L">Low (L)</option>
            </select>

            <select
              value={filters.type}
              onChange={(e) => setFilters({ ...filters, type: e.target.value, criticalUnassigned: false })}
              className="form-control"
              style={{ width: "auto", fontSize: "0.85rem", padding: "0.45rem 0.75rem" }}
            >
              <option value="">All Request Types</option>
              {Object.entries(TYPE_LABELS).map(([code, label]) => (
                <option key={code} value={code}>{label}</option>
              ))}
            </select>

            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value, criticalUnassigned: false })}
              className="form-control"
              style={{ width: "auto", fontSize: "0.85rem", padding: "0.45rem 0.75rem" }}
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="verified">Verified</option>
              <option value="dispatched">Dispatched</option>
              <option value="resolved">Resolved</option>
            </select>

            <select
              value={filters.source}
              onChange={(e) => setFilters({ ...filters, source: e.target.value, criticalUnassigned: false })}
              className="form-control"
              style={{ width: "auto", fontSize: "0.85rem", padding: "0.45rem 0.75rem" }}
            >
              <option value="">All Sources</option>
              <option value="app">App</option>
              <option value="sms">SMS</option>
            </select>

            <select
              value={filters.assigned}
              onChange={(e) => setFilters({ ...filters, assigned: e.target.value, criticalUnassigned: false })}
              className="form-control"
              style={{ width: "auto", fontSize: "0.85rem", padding: "0.45rem 0.75rem" }}
            >
              <option value="">All Assignments</option>
              <option value="yes">Assigned Only</option>
              <option value="no">Unassigned Only</option>
            </select>

            <button
              onClick={() => setFilters(DEFAULT_FILTERS)}
              className="btn btn-sm btn-secondary"
              style={{ fontSize: "0.82rem", padding: "0.45rem 0.75rem" }}
            >
              ✕ Clear
            </button>

            <div style={{ marginLeft: "auto", fontSize: "0.85rem", color: "#64748b", fontWeight: 600 }}>
              Showing {filtered.length} / {allReqs.length} requests
            </div>
          </div>

          {/* 5. TAB & LAYER TOGGLES BAR */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                onClick={() => setActiveTab("map")}
                className={`btn btn-sm ${activeTab === "map" ? "btn-primary" : "btn-secondary"}`}
                style={{ borderRadius: "6px", fontSize: "0.85rem" }}
              >
                🗺 Map View
              </button>
              <button
                onClick={() => setActiveTab("list")}
                className={`btn btn-sm ${activeTab === "list" ? "btn-primary" : "btn-secondary"}`}
                style={{ borderRadius: "6px", fontSize: "0.85rem" }}
              >
                📋 List View
              </button>
            </div>

            {/* Layer Toggles (Map Tab Only) */}
            {activeTab === "map" && (
              <div style={{ display: "flex", gap: "0.4rem" }}>
                {Object.keys(layerVis).map((k) => {
                  const active = layerVis[k as keyof typeof layerVis];
                  return (
                    <button
                      key={k}
                      onClick={() => setLayerVis({ ...layerVis, [k]: !active })}
                      style={{
                        background: active ? "#eff6ff" : "#ffffff",
                        color: active ? "#1d4ed8" : "#64748b",
                        border: `1px solid ${active ? "#bfdbfe" : "#cbd5e1"}`,
                        padding: "0.35rem 0.75rem",
                        borderRadius: "6px",
                        fontSize: "0.78rem",
                        fontWeight: 700,
                        cursor: "pointer",
                        textTransform: "capitalize",
                        transition: "all 0.15s ease",
                      }}
                    >
                      {active ? "✓ " : ""}{k}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* 6. MAP TAB - SPLIT LAYOUT */}
          {(
            <div style={{ display: activeTab === "map" ? "flex" : "none", gap: "1rem", height: "600px", borderRadius: "10px", overflow: "hidden", border: "1px solid #cbd5e1" }}>
              {/* Map View Container */}
              <div style={{ flex: 1, position: "relative", height: "100%" }}>
                <div ref={mapContainerRef} style={{ width: "100%", height: "100%" }} />

                {/* LEGEND OVERLAY (Glassmorphism bottom-left - Matching Image 2) */}
                <div
                  style={{
                    position: "absolute",
                    bottom: "20px",
                    left: "20px",
                    background: "rgba(10, 16, 30, 0.90)",
                    color: "#e8eef8",
                    padding: "0.85rem 1rem",
                    borderRadius: "10px",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                    boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
                    backdropFilter: "blur(8px)",
                    fontSize: "0.78rem",
                    width: "210px",
                    zIndex: 10,
                  }}
                >
                  <div style={{ fontWeight: 800, marginBottom: "0.4rem", color: "#ffffff", borderBottom: "1px solid rgba(255,255,255,0.12)", paddingBottom: "0.2rem", letterSpacing: "0.05em" }}>
                    LEGEND
                  </div>

                  {/* Request Severity */}
                  <div style={{ marginBottom: "0.5rem" }}>
                    <div style={{ fontSize: "0.7rem", color: "#9aa8c0", fontWeight: 700, textTransform: "uppercase", marginBottom: "0.25rem" }}>REQUEST SEVERITY</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.15rem", fontSize: "0.75rem" }}>
                      <div><strong style={{ color: "#e63946", marginRight: "0.3rem" }}>▼</strong> Critical</div>
                      <div><strong style={{ color: "#f4a261", marginRight: "0.3rem" }}>▼</strong> Medium</div>
                      <div><strong style={{ color: "#2a9d8f", marginRight: "0.3rem" }}>▼</strong> Low</div>
                    </div>
                  </div>

                  {/* Heatmap Gradient Bar */}
                  <div style={{ marginBottom: "0.5rem" }}>
                    <div style={{ fontSize: "0.7rem", color: "#9aa8c0", fontWeight: 700, textTransform: "uppercase", marginBottom: "0.25rem" }}>HEATMAP</div>
                    <div style={{ height: "8px", borderRadius: "4px", background: "linear-gradient(to right, #2a9d8f, #4ac35f, #e9c414, #f4a261, #e63946, #b91c1c)", marginBottom: "0.2rem" }} />
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.68rem", color: "#9aa8c0" }}>
                      <span>Low</span>
                      <span>High</span>
                    </div>
                  </div>

                  {/* Disaster Zones */}
                  <div style={{ marginBottom: "0.5rem" }}>
                    <div style={{ fontSize: "0.7rem", color: "#9aa8c0", fontWeight: 700, textTransform: "uppercase", marginBottom: "0.25rem" }}>DISASTER ZONES</div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                      <span style={{ display: "inline-block", width: "16px", height: "10px", border: "1.5px dashed #f59e0b", background: "rgba(245, 158, 11, 0.15)", borderRadius: "2px" }} />
                      <span>Zone boundary</span>
                    </div>
                  </div>

                  {/* Teams */}
                  <div style={{ marginBottom: "0.5rem" }}>
                    <div style={{ fontSize: "0.7rem", color: "#9aa8c0", fontWeight: 700, textTransform: "uppercase", marginBottom: "0.25rem" }}>TEAMS</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.15rem", fontSize: "0.75rem" }}>
                      <div><strong style={{ color: "#38bdf8", marginRight: "0.3rem" }}>▲</strong> Available</div>
                      <div><strong style={{ color: "#a78bfa", marginRight: "0.3rem" }}>▲</strong> Busy</div>
                    </div>
                  </div>

                  {/* Facilities */}
                  <div>
                    <div style={{ fontSize: "0.7rem", color: "#9aa8c0", fontWeight: 700, textTransform: "uppercase", marginBottom: "0.25rem" }}>FACILITIES</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.25rem", fontSize: "0.72rem" }}>
                      <span><strong style={{ color: "#d864f6" }}>✚</strong> Hospital</span>
                      <span><strong style={{ color: "#c084fc" }}>✚</strong> Clinic</span>
                      <span><strong style={{ color: "#34d399" }}>✚</strong> Shelter</span>
                      <span><strong style={{ color: "#fbbf24" }}>✚</strong> Camp</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Side Panel: Request Cards */}
              <div
                style={{
                  width: "340px",
                  background: "#ffffff",
                  borderLeft: "1px solid #cbd5e1",
                  overflowY: "auto",
                  padding: "0.85rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.6rem",
                }}
              >
                <div style={{ fontWeight: 800, fontSize: "0.9rem", color: "#0f172a", marginBottom: "0.2rem" }}>
                  Operational List ({filtered.length})
                </div>

                {filtered.length === 0 ? (
                  <div style={{ color: "#64748b", fontSize: "0.85rem", textAlign: "center", padding: "2rem 0" }}>
                    No requests match current filters.
                  </div>
                ) : (
                  filtered.map((r) => {
                    const isSelected = selectedId === Number(r.id);
                    const isCrit = r.severity === "C";
                    return (
                      <div
                        key={String(r.id)}
                        onClick={() => selectRequestOnMap(r)}
                        style={{
                          padding: "0.75rem",
                          borderRadius: "8px",
                          border: isSelected ? "2px solid #1d4ed8" : "1px solid #e2e8f0",
                          background: isSelected ? "#eff6ff" : "#ffffff",
                          cursor: "pointer",
                          transition: "all 0.15s ease",
                          boxShadow: "var(--shadow-sm)",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.3rem" }}>
                          <span style={{ fontWeight: 800, fontSize: "0.88rem", color: "#0f172a" }}>
                            #{String(r.id)} · {tL(String(r.type))}
                          </span>
                          <span
                            style={{
                              fontSize: "0.7rem",
                              fontWeight: 800,
                              padding: "0.15rem 0.5rem",
                              borderRadius: "9999px",
                              background: isCrit ? "#fff1f2" : r.severity === "M" ? "#fffbeb" : "#f0fdf4",
                              color: isCrit ? "#e63946" : r.severity === "M" ? "#d97706" : "#2a9d8f",
                              border: `1px solid ${isCrit ? "#fecdd3" : r.severity === "M" ? "#fde68a" : "#bbf7d0"}`,
                            }}
                          >
                            {sL(String(r.severity))}
                          </span>
                        </div>

                        <div style={{ fontSize: "0.78rem", color: "#475569", display: "flex", justifyContent: "space-between" }}>
                          <span>Status: <strong>{stL(String(r.status))}</strong></span>
                          <span>People: <strong>{String(r.headcount)}</strong></span>
                        </div>

                        <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "0.3rem", display: "flex", justifyContent: "space-between" }}>
                          <span>Score: {String(r.credibility_score)}/100</span>
                          <span>{r.assigned_team_id ? "✅ Assigned" : "⚠️ Unassigned"}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* 7. LIST TAB - FULL TABLE */}
          {activeTab === "list" && (
            <div className="gov-table-container">
              <table className="gov-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Type</th>
                    <th>Severity</th>
                    <th>Headcount</th>
                    <th>Status</th>
                    <th>Source</th>
                    <th>Score</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={String(r.id)}>
                      <td><strong>#{String(r.id)}</strong></td>
                      <td>{tL(String(r.type))}</td>
                      <td>
                        <span className={`badge ${r.severity === "C" ? "badge-critical" : r.severity === "M" ? "badge-warning" : "badge-success"}`}>
                          {sL(String(r.severity))}
                        </span>
                      </td>
                      <td>{String(r.headcount)}</td>
                      <td>{stL(String(r.status))}</td>
                      <td>{srcL(String(r.source))}</td>
                      <td>{String(r.credibility_score)}/100</td>
                      <td>
                        <button
                          onClick={() => { setActiveTab("map"); selectRequestOnMap(r); }}
                          className="btn btn-sm btn-secondary"
                          style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
                        >
                          📍 Map
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}