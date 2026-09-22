import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

/** Small "Offline" pill for the public / Citizen pages, shown only while the device is offline. */
export default function OfflineIndicator() {
  const { pathname } = useLocation();
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  if (online || !(pathname === "/" || pathname.startsWith("/citizen"))) return null;

  return (
    <div
      role="status"
      style={{
        position: "fixed",
        left: "50%",
        bottom: "1rem",
        transform: "translateX(-50%)",
        zIndex: 3000,
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        maxWidth: "calc(100% - 2rem)",
        background: "#0f172a",
        color: "#ffffff",
        padding: "0.45rem 0.9rem",
        borderRadius: "9999px",
        fontSize: "0.8rem",
        fontWeight: 600,
        boxShadow: "0 4px 12px rgba(15, 23, 42, 0.25)",
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#f59e0b", flexShrink: 0 }} />
      <span>Offline · saved app. New requests are sent by SMS.</span>
    </div>
  );
}
