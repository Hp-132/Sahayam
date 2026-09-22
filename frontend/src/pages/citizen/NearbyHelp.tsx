import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import logoSvg from "../../assets/logo.svg";

interface Facility {
  id: number;
  name: string;
  type: string;
  address?: string;
  latitude: number;
  longitude: number;
  distance_meters?: number;
}

export default function NearbyHelp() {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>("all");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => setCoords({ lat: 21.1702, lng: 72.8311 })
      );
    } else {
      setCoords({ lat: 21.1702, lng: 72.8311 });
    }
  }, []);

  useEffect(() => {
    if (!coords) return;
    setLoading(true);
    setError(null);

    api
      .facilitiesNearby(coords.lat, coords.lng, 25000)
      .then((data) => setFacilities(data as unknown as Facility[]))
      .catch(() => {
        api
          .mapFacilities()
          .then((data) => setFacilities(data as unknown as Facility[]))
          .catch((err) => setError(err.message || "Failed to load facilities"));
      })
      .finally(() => setLoading(false));
  }, [coords]);

  const filtered = facilities.filter(
    (f) => filterType === "all" || f.type?.toLowerCase() === filterType.toLowerCase()
  );

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
        <div style={{ marginBottom: "1rem" }}>
          <h1 style={{ fontSize: "1.4rem", fontWeight: 800, color: "#0f172a" }}>🏥 Nearby Relief Facilities</h1>
          <p style={{ fontSize: "0.85rem", color: "#64748b" }}>
            Indexed real hospitals, clinics, shelters & camps from OpenStreetMap.
          </p>
        </div>

        {/* Filter Pills */}
        <div style={{ display: "flex", gap: "0.5rem", overflowX: "auto", paddingBottom: "0.5rem", marginBottom: "1rem" }}>
          {["all", "hospital", "clinic", "shelter", "camp"].map((t) => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`btn btn-sm ${filterType === t ? "btn-accent" : "btn-secondary"}`}
              style={{ borderRadius: "20px", textTransform: "capitalize", whiteSpace: "nowrap" }}
            >
              {t === "all" ? "All Facilities" : `${t}s`}
            </button>
          ))}
        </div>

        {/* List Content */}
        {loading ? (
          <div style={{ padding: "2rem", textAlign: "center", color: "#64748b" }}>Finding nearby facilities...</div>
        ) : error ? (
          <div style={{ padding: "1rem", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "8px", color: "#b91c1c" }}>
            {error}
          </div>
        ) : filtered.length === 0 ? (
          <div className="gov-card" style={{ textAlign: "center", color: "#64748b" }}>
            No facilities matching current filter.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
            {filtered.map((f) => {
              const km = f.distance_meters ? (f.distance_meters / 1000).toFixed(1) : null;
              return (
                <div key={f.id} className="gov-card" style={{ margin: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.4rem" }}>
                    <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 800, color: "#0f172a" }}>{f.name}</h3>
                    <span className={`badge badge-${f.type === "hospital" ? "critical" : f.type === "shelter" ? "success" : "info"}`}>
                      {f.type}
                    </span>
                  </div>

                  {f.address && (
                    <div style={{ fontSize: "0.85rem", color: "#475569", marginBottom: "0.6rem" }}>
                      📍 {f.address}
                    </div>
                  )}

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "0.5rem", borderTop: "1px solid #f1f5f9" }}>
                    <span style={{ fontSize: "0.85rem", color: "#1d4ed8", fontWeight: 700 }}>
                      {km ? `~ ${km} km away` : `Lat: ${f.latitude.toFixed(3)}, Lng: ${f.longitude.toFixed(3)}`}
                    </span>
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${f.latitude},${f.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-sm btn-secondary"
                    >
                      Map Directions ↗
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
