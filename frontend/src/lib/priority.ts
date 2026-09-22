/**
 * Request priority is decided by the backend from the request type
 * (GET /api/requests/priority-map). The citizen never chooses it.
 *
 * The map is cached so the offline DR1 SMS carries the same priority; the
 * fallback below mirrors backend/app/services/priority.py for a first visit
 * made while offline. The backend re-derives priority on receipt either way.
 */
import { api } from "../api/client";

const CACHE_KEY = "sahayam_priority_map";

const FALLBACK: Record<string, string> = {
  MED: "C", SAR: "C", FIRE: "C", MISSING: "C", EVAC: "C",
  FOOD: "M", CLOTHES: "M", SUPPLIES: "M", SHELTER: "M",
  OTHER: "L",
};

export const PRIORITY_LABELS: Record<string, string> = {
  C: "Critical",
  M: "Medium",
  L: "Low",
};

function cached(): Record<string, string> {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) return { ...FALLBACK, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return FALLBACK;
}

export function priorityForType(type: string): string {
  return cached()[type] ?? "L";
}

/** Refresh the cached map from the backend (no-op when offline). */
export async function syncPriorityMap(): Promise<void> {
  try {
    const map = await api.priorityMap();
    localStorage.setItem(CACHE_KEY, JSON.stringify(map));
  } catch {
    /* offline — keep cached / fallback map */
  }
}
