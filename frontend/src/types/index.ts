export interface StaffMember {
  id: number;
  fullName: string;
  email: string | null;
  role: string;
  defaultShiftTypeId: number | null;
  defaultShiftName: string | null;
  hireDate: string | null;
  profileImageUrl: string | null;
  weekendCallAvailable: boolean;
  initials: string;
  active: boolean;
}

export interface ShiftType {
  id: number;
  name: string;
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
  durationMinutes: number;
  color: string;
}

export interface ScheduleEntry {
  id: number;
  staffId: number;
  staffName: string | null;
  shiftTypeId: number;
  shiftName: string | null;
  date: string; // "YYYY-MM-DD"
  notes: string | null;
  bench: string | null;
  dayOff: boolean;
}

export interface CurrentUser {
  id: number;
  username: string;
  role: "staff" | "supervisor";
  staffId: number | null;
  staff: StaffMember | null;
}

export type TradeStatus = "pending" | "approved" | "denied" | "cancelled";

export interface TradeRequest {
  id: number;
  entryId: number;
  date: string;
  shiftName: string | null;
  requestedByStaffId: number;
  requestedByName: string | null;
  proposedStaffId: number | null;
  proposedStaffName: string | null;
  proposedEntryId: number | null;
  proposedDate: string | null;
  status: TradeStatus;
  note: string | null;
  createdAt: string;
}

export interface OvertimeBid {
  id: number;
  staffId: number;
  staffName: string | null;
  shiftKind: "morning" | "late";
  rank: number | null;
  likelyToGet: boolean;
  createdAt: string;
}

export interface OvertimeSlot {
  id: number;
  date: string;
  morningSpots: number;
  lateSpots: number;
  deadline: string;
  bids: OvertimeBid[];
}

export interface BenchMetric {
  bench: string;
  days: number;
  percentage: number;
}

export interface StaffBenchMetric {
  staffId: number;
  staffName: string;
  hireDate: string | null;
  totalAssignedDays: number;
  benches: BenchMetric[];
}

export interface BenchMetricsResult {
  start: string;
  end: string;
  staff: StaffBenchMetric[];
}

export type ViewMode = "week" | "month";

export interface ImportResult {
  createdStaff: number;
  updatedEntries: number;
  skipped: number;
  errors: string[];
}
