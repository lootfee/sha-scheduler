import type { StaffMember, ShiftType, ScheduleEntry, ImportResult, CurrentUser, TradeRequest, OvertimeSlot, BenchMetricsResult } from "../types";

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    credentials: "include", // send/receive the session cookie
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  login: (username: string, password: string) =>
    request<CurrentUser>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),

  logout: () => request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),

  me: () => request<CurrentUser | null>("/api/auth/me"),

  getTrades: (status?: string) =>
    request<TradeRequest[]>(`/api/trades${status ? `?status=${status}` : ""}`),

  createTrade: (entryId: number, proposedStaffId?: number, note?: string) =>
    request<TradeRequest>("/api/trades", {
      method: "POST",
      body: JSON.stringify({ entryId, proposedStaffId, note }),
    }),

    createSwapTrade: (entryId: number, proposedEntryId: number, note?: string) =>
      request<TradeRequest>("/api/trades", { method: "POST", body: JSON.stringify({ entryId, proposedEntryId, note }) }),

  approveTrade: (id: number) => request<TradeRequest>(`/api/trades/${id}/approve`, { method: "POST" }),

  denyTrade: (id: number) => request<TradeRequest>(`/api/trades/${id}/deny`, { method: "POST" }),

  cancelTrade: (id: number) => request<TradeRequest>(`/api/trades/${id}/cancel`, { method: "POST" }),

  getStaff: () => request<StaffMember[]>("/api/staff"),

  createStaff: (fullName: string, role?: string) =>
    request<StaffMember>("/api/staff", {
      method: "POST",
      body: JSON.stringify({ fullName, role }),
    }),

  updateStaff: (id: number, patch: Partial<StaffMember>) =>
    request<StaffMember>(`/api/staff/${id}`, {
      method: "PUT",
      body: JSON.stringify(patch),
    }),

  deactivateStaff: (id: number) =>
    request<{ ok: boolean }>(`/api/staff/${id}`, { method: "DELETE" }),

  getShiftTypes: () => request<ShiftType[]>("/api/shift-types"),

  getSchedule: (start: string, end: string) =>
    request<ScheduleEntry[]>(`/api/schedule?start=${start}&end=${end}`),

  upsertEntry: (staffId: number, shiftTypeId: number, date: string, notes?: string, bench?: string) =>
    request<ScheduleEntry>("/api/schedule", {
      method: "POST",
      body: JSON.stringify({ staffId, shiftTypeId, date, notes, bench }),
    }),

  autoAssignBenches: (start: string, end: string) =>
    request<{ updated: number; entries: ScheduleEntry[] }>("/api/schedule/auto-bench", {
      method: "POST",
      body: JSON.stringify({ start, end }),
    }),

  getBenchMetrics: (start: string, end: string) =>
    request<BenchMetricsResult>(`/api/schedule/bench-metrics?start=${start}&end=${end}`),

  deleteEntry: (id: number) =>
    request<{ ok: boolean }>(`/api/schedule/${id}`, { method: "DELETE" }),

  exportUrl: (start: string, end: string) =>
    `${BASE_URL}/api/schedule/export?start=${start}&end=${end}`,

  importSchedule: async (file: File): Promise<ImportResult> => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${BASE_URL}/api/schedule/import`, {
      method: "POST",
      body: form,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Import failed: ${res.status}`);
    }
    return res.json();
  },

  updateMyProfile: (patch: { profileImageUrl?: string; weekendCallAvailable?: boolean; currentPassword?: string; newPassword?: string }) =>
    request<CurrentUser>("/api/staff/me", { method: "PUT", body: JSON.stringify(patch) }),
  getOvertime: (start: string) => request<OvertimeSlot[]>(`/api/overtime?start=${start}`),
  setOvertime: (date: string, morningSpots: number, lateSpots: number) => request<OvertimeSlot>(`/api/overtime/${date}`, { method: "PUT", body: JSON.stringify({ morningSpots, lateSpots }) }),
  bidOvertime: (slotId: number, shiftKind: "morning" | "late") => request(`/api/overtime/${slotId}/bids`, { method: "POST", body: JSON.stringify({ shiftKind }) }),
  cancelOvertimeBid: (slotId: number) => request<{ ok: boolean }>(`/api/overtime/${slotId}/bids/me`, { method: "DELETE" }),
};
