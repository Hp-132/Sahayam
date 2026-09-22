import { getCitizenToken, getNgoToken } from "../lib/session";
import { buildDr1Sms } from "../lib/offlineQueue";

const BASE = (import.meta.env.VITE_API_BASE_URL as string) || "http://localhost:8000";

async function request<T>(path: string, options: RequestInit = {}, authToken?: string | null): Promise<T> {
  const token = authToken !== undefined ? authToken : getCitizenToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail || JSON.stringify(body);
    } catch {
      /* ignore */
    }
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  base: BASE,

  signup: (body: { full_name: string; phone: string; email?: string; password: string }) =>
    request<{ token: string; citizen: Record<string, unknown> }>("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  signin: (body: { login: string; password: string }) =>
    request<{ token: string; citizen: Record<string, unknown> }>("/api/auth/signin", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  me: () => request<Record<string, unknown>>("/api/auth/me"),

  signout: () =>
    request("/api/auth/signout", { method: "POST" }).catch(() => undefined),

  createRequest: (body: Record<string, unknown>) =>
    request<Record<string, unknown>>("/api/requests", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getRequest: (id: number | string) => request<Record<string, unknown>>(`/api/requests/${id}`),

  getRequestByTrack: (trackId: string) =>
    request<Record<string, unknown>>(`/api/requests/by-track/${encodeURIComponent(trackId)}`),

  listMyRequests: (params?: Record<string, string>) => {
    const q = params ? "?" + new URLSearchParams(params).toString() : "";
    return request<Record<string, unknown>[]>(`/api/requests/mine${q}`);
  },

  listRequests: (params?: Record<string, string>) => {
    const q = params ? "?" + new URLSearchParams(params).toString() : "";
    return request<Record<string, unknown>[]>(`/api/requests${q}`);
  },

  verifyRequest: (id: number, by: string, responderId: number) =>
    request(`/api/requests/${id}/verify?by=${by}&responder_id=${responderId}`, {
      method: "PATCH",
    }),

  resolveRequest: (id: number) =>
    request(`/api/requests/${id}/resolve`, { method: "PATCH" }),

  acknowledgeRequest: (id: number) =>
    request(`/api/requests/${id}/acknowledge`, { method: "PATCH" }),

  assignNearest: (id: number) =>
    request(`/api/requests/${id}/assign-nearest`, { method: "POST" }),

  listTeams: () => request<Record<string, unknown>[]>("/api/teams"),
  teamRequests: (id: number) => request<Record<string, unknown>[]>(`/api/teams/${id}/requests`),
  nearestTeamForRequest: (id: number) =>
    request<Record<string, unknown>>(`/api/requests/${id}/nearest-team`),

  requestDuplicates: (id: number) =>
    request<Record<string, unknown>>(`/api/requests/${id}/duplicates`),
  requestLocationContext: (id: number) =>
    request<Record<string, unknown>>(`/api/requests/${id}/location-context`),

  adminDashboard: () => request<Record<string, number>>("/api/admin/dashboard"),
  adminRequests: (params?: Record<string, string>) => {
    const q = params ? "?" + new URLSearchParams(params).toString() : "";
    return request<Record<string, unknown>[]>(`/api/admin/requests${q}`);
  },
  adminVerify: (id: number, responderId = 1) =>
    request(`/api/admin/requests/${id}/verify?responder_id=${responderId}`, {
      method: "PATCH",
    }),
  adminAssign: (id: number, teamId: number) =>
    request(`/api/admin/requests/${id}/assign`, {
      method: "PATCH",
      body: JSON.stringify({ team_id: teamId }),
    }),
  adminReassign: (id: number, teamId: number) =>
    request(`/api/admin/requests/${id}/reassign`, {
      method: "PATCH",
      body: JSON.stringify({ team_id: teamId }),
    }),

  adminResolve: (id: number) =>
    request(`/api/admin/requests/${id}/resolve`, { method: "PATCH" }),
  adminCoordination: (id: number) =>
    request<Record<string, unknown>>(`/api/admin/requests/${id}/coordination`),
  adminBroadcast: (id: number) =>
    request<{ ngos_notified: number }>(`/api/admin/requests/${id}/broadcast`, { method: "POST" }),

  priorityMap: () => request<Record<string, string>>("/api/requests/priority-map"),

  // NGO portal (uses the NGO session token, not the citizen one)
  ngoOptions: () => request<{ org_types: string[]; services: string[] }>("/api/ngo/options", {}, null),
  ngoRegister: (body: Record<string, unknown>) =>
    request<{ token: string; ngo: Record<string, unknown> }>("/api/ngo/register", {
      method: "POST",
      body: JSON.stringify(body),
    }, null),
  ngoSignin: (body: { login: string; password: string }) =>
    request<{ token: string; ngo: Record<string, unknown> }>("/api/ngo/signin", {
      method: "POST",
      body: JSON.stringify(body),
    }, null),
  ngoSignout: () =>
    request("/api/ngo/signout", { method: "POST" }, getNgoToken()).catch(() => undefined),
  ngoDemoAccounts: () =>
    request<{ password: string; accounts: { email: string; unit_name: string; org_name?: string; status: string }[] }>(
      "/api/ngo/demo-accounts", {}, null
    ),
  ngoMe: () => request<Record<string, unknown>>("/api/ngo/me", {}, getNgoToken()),
  ngoSetAvailability: (available: boolean) =>
    request<Record<string, unknown>>("/api/ngo/me/availability", {
      method: "PATCH",
      body: JSON.stringify({ available }),
    }, getNgoToken()),
  ngoAssignments: () => request<Record<string, unknown>[]>("/api/ngo/assignments", {}, getNgoToken()),
  ngoAccept: (id: number) =>
    request(`/api/ngo/assignments/${id}/accept`, { method: "POST" }, getNgoToken()),
  ngoReject: (id: number, reason: string) =>
    request<{ alternatives_found: number }>(`/api/ngo/assignments/${id}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }, getNgoToken()),
  ngoOnTheWay: (id: number) =>
    request(`/api/ngo/assignments/${id}/on-the-way`, { method: "POST" }, getNgoToken()),
  ngoComplete: (id: number) =>
    request(`/api/ngo/assignments/${id}/complete`, { method: "POST" }, getNgoToken()),

  mapRequests: () => request("/api/map/requests"),
  mapHeatmap: () => request("/api/map/heatmap"),
  mapZones: () => request("/api/map/zones"),
  mapTeams: () => request("/api/map/teams"),
  mapFacilities: () => request("/api/map/facilities"),

  facilitiesNearby: (lat: number, lng: number, radius = 5000) =>
    request<Record<string, unknown>[]>(`/api/facilities/nearby?lat=${lat}&lng=${lng}&radius=${radius}`),
  safeAreasNearby: (lat: number, lng: number, radius = 5000) =>
    request<Record<string, unknown>[]>(`/api/safe-areas/nearby?lat=${lat}&lng=${lng}&radius=${radius}`),

  resolveLandmark: (landmark: string) =>
    request<{ latitude: number; longitude: number; display_name: string }>(
      "/api/location/resolve",
      { method: "POST", body: JSON.stringify({ landmark }) }
    ),
};

export function buildOfflineSms(opts: {
  type: string;
  severity: string;
  headcount: number;
  lat?: number;
  lng?: number;
  landmark?: string;
}): string {
  return buildDr1Sms(opts);
}
