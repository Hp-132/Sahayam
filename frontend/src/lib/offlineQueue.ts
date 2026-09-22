/**
 * Offline emergency request queue.
 * Local-only states: Pending Transmission | SMS Prepared
 * Real Track ID comes from backend after SMS/API success — never invent one.
 */

export type OfflineStatus = "Pending Transmission" | "SMS Prepared";

export interface OfflineQueuedRequest {
  localId: string;
  type: string;
  severity: string;
  headcount: number;
  latitude?: number;
  longitude?: number;
  landmark_text?: string;
  other_description?: string;
  location_source: "gps" | "landmark";
  smsText: string;
  status: OfflineStatus;
  createdAt: string;
  trackId?: string;
  backendId?: number;
}

const QUEUE_KEY = "sahayam_offline_queue";

export function loadOfflineQueue(): OfflineQueuedRequest[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item: Record<string, unknown>) => ({
      localId: String(item.localId || item.id || `offline_${Date.now()}`),
      type: String(item.type || "OTHER"),
      severity: String(item.severity || "M"),
      headcount: Number(item.headcount) || 1,
      latitude: item.latitude != null ? Number(item.latitude) : undefined,
      longitude: item.longitude != null ? Number(item.longitude) : undefined,
      landmark_text: item.landmark_text ? String(item.landmark_text) : undefined,
      other_description: item.other_description ? String(item.other_description) : undefined,
      location_source: (item.location_source as "gps" | "landmark") || "gps",
      smsText: String(item.smsText || ""),
      status: (item.status as OfflineStatus) || "Pending Transmission",
      createdAt: String(item.createdAt || new Date().toISOString()),
      trackId: item.trackId ? String(item.trackId) : undefined,
      backendId: item.backendId != null ? Number(item.backendId) : undefined,
    }));
  } catch {
    return [];
  }
}

export function saveOfflineQueue(queue: OfflineQueuedRequest[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function enqueueOfflineRequest(
  item: Omit<OfflineQueuedRequest, "localId" | "createdAt" | "status"> & {
    status?: OfflineStatus;
  }
): OfflineQueuedRequest {
  const queue = loadOfflineQueue();
  const entry: OfflineQueuedRequest = {
    ...item,
    localId: `offline_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
    status: item.status || "Pending Transmission",
  };
  queue.unshift(entry);
  saveOfflineQueue(queue);
  return entry;
}

export function updateOfflineRequest(
  localId: string,
  patch: Partial<OfflineQueuedRequest>
): OfflineQueuedRequest | null {
  const queue = loadOfflineQueue();
  const idx = queue.findIndex((q) => q.localId === localId);
  if (idx < 0) return null;
  queue[idx] = { ...queue[idx], ...patch };
  saveOfflineQueue(queue);
  return queue[idx];
}

export function removeOfflineRequest(localId: string) {
  const queue = loadOfflineQueue().filter((q) => q.localId !== localId);
  saveOfflineQueue(queue);
}

export function buildDr1Sms(opts: {
  type: string;
  severity: string;
  headcount: number;
  lat?: number;
  lng?: number;
  landmark?: string;
}): string {
  if (opts.lat != null && opts.lng != null && !Number.isNaN(opts.lat) && !Number.isNaN(opts.lng)) {
    return `DR1|${opts.type}|${opts.severity}|${opts.headcount}|${opts.lat}|${opts.lng}`;
  }
  const landmark = (opts.landmark || "unknown").replace(/\|/g, " ");
  return `DR1|${opts.type}|${opts.severity}|${opts.headcount}|${landmark}`;
}

export function openSmsComposer(smsBody: string): void {
  const gateway =
    (import.meta.env.VITE_SMS_GATEWAY_NUMBER as string | undefined)?.trim() || "";
  const number = gateway && !gateway.includes(":") ? gateway : "";
  const uri = number
    ? `sms:${number}?body=${encodeURIComponent(smsBody)}`
    : `sms:?body=${encodeURIComponent(smsBody)}`;
  window.location.href = uri;
}
