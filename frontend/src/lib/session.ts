/**
 * Session layer for Sahayam.
 * - Citizen: real backend auth token + profile in localStorage (persists across restarts)
 * - Admin: sessionStorage flag after credential check
 * - NGO: backend auth token + organisation profile in localStorage
 */

export type Role = "citizen" | "admin" | "ngo";

export interface CitizenProfile {
  id: number | string;
  fullName: string;
  phone: string;
  email: string;
  address?: string;
  landmark?: string;
  role: "citizen";
  createdAt?: string;
  token?: string;
}

export interface AdminSession {
  email: string;
  role: "admin";
  loggedInAt: string;
}

const CITIZEN_KEY = "sahayam_citizen";
const CITIZEN_TOKEN_KEY = "sahayam_citizen_token";
const ADMIN_KEY = "sahayam_admin";
const ACTIVE_ROLE_KEY = "sahayam_active_role";
const NGO_KEY = "sahayam_ngo";
const NGO_TOKEN_KEY = "sahayam_ngo_token";

export function getActiveRole(): Role | null {
  return (localStorage.getItem(ACTIVE_ROLE_KEY) as Role) || null;
}

export function setActiveRole(role: Role | null) {
  if (role) localStorage.setItem(ACTIVE_ROLE_KEY, role);
  else localStorage.removeItem(ACTIVE_ROLE_KEY);
}

export function getCitizenToken(): string | null {
  return localStorage.getItem(CITIZEN_TOKEN_KEY);
}

export function getCitizen(): CitizenProfile | null {
  const raw = localStorage.getItem(CITIZEN_KEY);
  if (!raw) return null;
  try {
    const profile = JSON.parse(raw) as CitizenProfile;
    const token = getCitizenToken();
    if (token) profile.token = token;
    return profile;
  } catch {
    return null;
  }
}

export function saveCitizenSession(
  citizen: {
    id: number | string;
    full_name?: string;
    fullName?: string;
    phone: string;
    email?: string | null;
    created_at?: string;
  },
  token: string
): CitizenProfile {
  const profile: CitizenProfile = {
    id: citizen.id,
    fullName: citizen.full_name || citizen.fullName || "",
    phone: citizen.phone,
    email: citizen.email || "",
    role: "citizen",
    createdAt: citizen.created_at || new Date().toISOString(),
    token,
  };
  localStorage.setItem(CITIZEN_KEY, JSON.stringify({ ...profile, token: undefined }));
  localStorage.setItem(CITIZEN_TOKEN_KEY, token);
  setActiveRole("citizen");
  return profile;
}

export function saveCitizen(
  data: Omit<CitizenProfile, "id" | "role" | "createdAt"> & { id?: string | number }
): CitizenProfile {
  const existing = getCitizen();
  const profile: CitizenProfile = {
    id: data.id || existing?.id || `cit_${Date.now()}`,
    fullName: data.fullName,
    phone: data.phone,
    email: data.email,
    address: data.address,
    landmark: data.landmark,
    role: "citizen",
    createdAt: existing?.createdAt || new Date().toISOString(),
  };
  localStorage.setItem(CITIZEN_KEY, JSON.stringify(profile));
  setActiveRole("citizen");
  return profile;
}

export function clearCitizen() {
  localStorage.removeItem(CITIZEN_KEY);
  localStorage.removeItem(CITIZEN_TOKEN_KEY);
}

export function isCitizenAuthenticated(): boolean {
  return !!(getCitizen() && getCitizenToken());
}

export function getAdmin(): AdminSession | null {
  const raw = sessionStorage.getItem(ADMIN_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AdminSession;
  } catch {
    return null;
  }
}

export function loginAdmin(email: string, password: string): { ok: boolean; error?: string } {
  const expectedEmail = (import.meta.env.VITE_ADMIN_EMAIL as string) || "adming4@gmail.com";
  const expectedPassword =
    (import.meta.env.VITE_ADMIN_PASSWORD as string) || "sahayamg4";

  if (
    email.trim().toLowerCase() === expectedEmail.toLowerCase() &&
    password === expectedPassword
  ) {
    const session: AdminSession = {
      email: expectedEmail,
      role: "admin",
      loggedInAt: new Date().toISOString(),
    };
    sessionStorage.setItem(ADMIN_KEY, JSON.stringify(session));
    setActiveRole("admin");
    return { ok: true };
  }
  return { ok: false, error: "Invalid admin credentials." };
}

export function logoutAdmin() {
  sessionStorage.removeItem(ADMIN_KEY);
}

export function switchRole() {
  setActiveRole(null);
  logoutAdmin();
}

export function isAdminAuthenticated(): boolean {
  return !!getAdmin();
}

export interface NgoProfile {
  account_id: number;
  team_id: number;
  org_name: string;
  unit_name: string;
  org_type: string;
  contact_person: string;
  phone: string;
  email: string;
  registration_number?: string | null;
  years_experience?: number | null;
  operating_areas?: string | null;
  headquarters?: string | null;
  team_size?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  services: string[];
  capacity: number;
  active_load: number;
  status: "available" | "busy" | "unavailable";
  self_registered: boolean;
}

export function getNgoToken(): string | null {
  return localStorage.getItem(NGO_TOKEN_KEY);
}

export function getNgo(): NgoProfile | null {
  const raw = localStorage.getItem(NGO_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as NgoProfile;
  } catch {
    return null;
  }
}

export function saveNgoSession(ngo: NgoProfile, token?: string) {
  localStorage.setItem(NGO_KEY, JSON.stringify(ngo));
  if (token) localStorage.setItem(NGO_TOKEN_KEY, token);
  setActiveRole("ngo");
}

export function clearNgo() {
  localStorage.removeItem(NGO_KEY);
  localStorage.removeItem(NGO_TOKEN_KEY);
}

export function isNgoAuthenticated(): boolean {
  return !!(getNgo() && getNgoToken());
}
