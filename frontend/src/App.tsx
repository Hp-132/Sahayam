import { Routes, Route, Navigate } from "react-router-dom";
import Landing from "./pages/Landing";
import CitizenRegister from "./pages/citizen/Register";
import CitizenLogin from "./pages/citizen/Login";
import CitizenDashboard from "./pages/citizen/Dashboard";
import CitizenRequest from "./pages/citizen/RequestFlow";
import CitizenTrack from "./pages/citizen/Track";
import CitizenProfile from "./pages/citizen/Profile";
import NearbyHelp from "./pages/citizen/NearbyHelp";
import EmergencyHelplines from "./pages/citizen/EmergencyHelplines";
import AdminLogin from "./pages/admin/Login";
import AdminDashboard from "./pages/admin/Dashboard";
import NgoLogin from "./pages/ngo/Login";
import NgoRegister from "./pages/ngo/Register";
import NgoDashboard from "./pages/ngo/Dashboard";
import { isCitizenAuthenticated, isAdminAuthenticated, isNgoAuthenticated } from "./lib/session";
import OfflineIndicator from "./components/OfflineIndicator";

function CitizenGuard({ children }: { children: React.ReactNode }) {
  if (!isCitizenAuthenticated()) return <Navigate to="/citizen/login" replace />;
  return <>{children}</>;
}

function AdminGuard({ children }: { children: React.ReactNode }) {
  if (!isAdminAuthenticated()) return <Navigate to="/admin/login" replace />;
  return <>{children}</>;
}

function NgoGuard({ children }: { children: React.ReactNode }) {
  if (!isNgoAuthenticated()) return <Navigate to="/ngo/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <div className="app-shell">
      <OfflineIndicator />
      <Routes>
        <Route path="/" element={<Landing />} />

        {/* Citizen */}
        <Route path="/citizen/register" element={<CitizenRegister />} />
        <Route path="/citizen/login" element={<CitizenLogin />} />
        <Route
          path="/citizen/dashboard"
          element={
            <CitizenGuard>
              <CitizenDashboard />
            </CitizenGuard>
          }
        />
        <Route
          path="/citizen/request"
          element={
            <CitizenGuard>
              <CitizenRequest />
            </CitizenGuard>
          }
        />
        <Route
          path="/citizen/track"
          element={
            <CitizenGuard>
              <CitizenTrack />
            </CitizenGuard>
          }
        />
        <Route
          path="/citizen/track/:id"
          element={
            <CitizenGuard>
              <CitizenTrack />
            </CitizenGuard>
          }
        />
        <Route
          path="/citizen/nearby"
          element={
            <CitizenGuard>
              <NearbyHelp />
            </CitizenGuard>
          }
        />
        <Route
          path="/citizen/helplines"
          element={
            <CitizenGuard>
              <EmergencyHelplines />
            </CitizenGuard>
          }
        />
        <Route
          path="/citizen/profile"
          element={
            <CitizenGuard>
              <CitizenProfile />
            </CitizenGuard>
          }
        />

        {/* Admin */}
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route
          path="/admin"
          element={
            <AdminGuard>
              <AdminDashboard />
            </AdminGuard>
          }
        />
        <Route
          path="/admin/*"
          element={
            <AdminGuard>
              <AdminDashboard />
            </AdminGuard>
          }
        />

        {/* NGO / Relief organization */}
        <Route path="/ngo/login" element={<NgoLogin />} />
        <Route path="/ngo/register" element={<NgoRegister />} />
        <Route
          path="/ngo"
          element={
            <NgoGuard>
              <NgoDashboard />
            </NgoGuard>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
