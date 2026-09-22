/** Shared labels for NGO coordination screens (NGO portal + admin). */

export const SERVICE_LABELS: Record<string, string> = {
  medical: "Medical aid",
  rescue: "Search & rescue",
  fire: "Fire response",
  evacuation: "Evacuation",
  food: "Food & water",
  shelter: "Shelter / relief camps",
  clothing: "Clothing",
  supplies: "Relief & medical supplies",
};

export const ASSIGNMENT_STATUS_LABELS: Record<string, string> = {
  offered: "Awaiting Response",
  accepted: "Accepted",
  on_the_way: "On the Way",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  completed: "Completed",
};

export const ASSIGNMENT_STATUS_BADGE: Record<string, string> = {
  offered: "warning",
  accepted: "info",
  on_the_way: "info",
  rejected: "critical",
  withdrawn: "navy",
  completed: "success",
};

export const STAGE_LABELS: Record<string, string> = {
  awaiting_response: "Awaiting NGO Response",
  accepted: "NGO Accepted",
  on_the_way: "NGO On the Way",
  rejected: "Rejected — Reassign",
  completed: "Completed",
};

export const TEAM_STATUS_BADGE: Record<string, string> = {
  available: "success",
  busy: "warning",
  unavailable: "navy",
};

export function km(meters?: number | null): string {
  return meters == null ? "—" : `${(meters / 1000).toFixed(1)} km`;
}
