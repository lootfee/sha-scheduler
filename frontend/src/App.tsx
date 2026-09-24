import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api/client";
import type { StaffMember, ShiftType, ScheduleEntry, ViewMode, CurrentUser } from "./types";
import {
  addDays,
  endOfMonth,
  formatMonthYear,
  getWeekDays,
  startOfMonth,
  toISODate,
} from "./utils/date";
import { WeekView } from "./components/WeekView";
import { MonthView } from "./components/MonthView";
import { DayDetailModal } from "./components/DayDetailModal";
import { StaffModal } from "./components/StaffModal";
import { LoginScreen } from "./components/LoginScreen";
import { TradesModal } from "./components/TradesModal";
import { RequestTradeModal } from "./components/RequestTradeModal";
import { ProfileModal } from "./components/ProfileModal";
import { OvertimeModal } from "./components/OvertimeModal";
import { BenchMetricsModal } from "./components/BenchMetricsModal";

export default function App() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null | undefined>(undefined); // undefined = still checking
  const [view, setView] = useState<ViewMode>("week");
  const [anchorDate, setAnchorDate] = useState(new Date());
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [shiftTypes, setShiftTypes] = useState<ShiftType[]>([]);
  const [entries, setEntries] = useState<ScheduleEntry[]>([]);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [showTradesModal, setShowTradesModal] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showOvertime, setShowOvertime] = useState(false);
  const [showBenchMetrics, setShowBenchMetrics] = useState(false);
  const [tradeEntry, setTradeEntry] = useState<ScheduleEntry | null>(null);
  const [status, setStatus] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.me().then(setCurrentUser).catch(() => setCurrentUser(null));
  }, []);

  const { rangeStart, rangeEnd } = useMemo(() => {
    if (view === "week") {
      const days = getWeekDays(anchorDate);
      return { rangeStart: days[0], rangeEnd: days[6] };
    }
    const first = startOfMonth(anchorDate);
    const last = endOfMonth(anchorDate);
    return { rangeStart: addDays(first, -7), rangeEnd: addDays(last, 7) };
  }, [view, anchorDate]);

  useEffect(() => {
    if (!currentUser) return;
    api.getStaff().then(setStaff).catch(showError);
    api.getShiftTypes().then(setShiftTypes).catch(showError);
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    api.getSchedule(toISODate(rangeStart), toISODate(rangeEnd)).then(setEntries).catch(showError);
  }, [currentUser, rangeStart, rangeEnd]);

  function showError(e: unknown) {
    setStatus({ kind: "error", text: e instanceof Error ? e.message : "Something went wrong" });
    setTimeout(() => setStatus(null), 4000);
  }

  function showSuccess(text: string) {
    setStatus({ kind: "success", text });
    setTimeout(() => setStatus(null), 4000);
  }

  if (currentUser === undefined) {
    return null; // brief auth check, avoids a login-screen flash for already-signed-in users
  }

  if (!currentUser) {
    return <LoginScreen onLoggedIn={setCurrentUser} />;
  }

  const isSupervisor = currentUser.role === "supervisor";

  async function handleAssign(staffId: number, date: string, shiftTypeId: number, bench: string) {
    try {
      const saved = await api.upsertEntry(staffId, shiftTypeId, date, undefined, bench);
      setEntries((prev) => [...prev.filter((e) => !(e.staffId === staffId && e.date === date)), saved]);
    } catch (e) {
      showError(e);
    }
  }

  async function handleClear(entryId: number) {
    try {
      await api.deleteEntry(entryId);
      setEntries((prev) => prev.filter((e) => e.id !== entryId));
    } catch (e) {
      showError(e);
    }
  }

  async function handleAutoAssignBenches() {
    try {
      const result = await api.autoAssignBenches(toISODate(rangeStart), toISODate(rangeEnd));
      setEntries(result.entries);
      showSuccess(`Auto-assigned benches for ${result.updated} scheduled entries.`);
    } catch (e) {
      showError(e);
    }
  }

  async function refreshSchedule() {
    const updated = await api.getSchedule(toISODate(rangeStart), toISODate(rangeEnd));
    setEntries(updated);
  }

  async function handleAddStaff(name: string) {
    const created = await api.createStaff(name);
    setStaff((prev) => [...prev, created].sort((a, b) => a.fullName.localeCompare(b.fullName)));
  }

  async function handleDeactivateStaff(id: number) {
    await api.deactivateStaff(id);
    setStaff((prev) => prev.filter((p) => p.id !== id));
  }

  async function handleUpdateStaff(id: number, patch: Partial<StaffMember>) {
    const updated = await api.updateStaff(id, patch);
    setStaff((prev) => prev.map((person) => person.id === id ? updated : person));
  }

  function stepDate(dir: -1 | 1) {
    setAnchorDate((prev) => (view === "week" ? addDays(prev, dir * 7) : addDays(prev, dir * 28)));
  }

  function goToday() {
    setAnchorDate(new Date());
  }

  function handleExport() {
    window.open(api.exportUrl(toISODate(rangeStart), toISODate(rangeEnd)), "_blank");
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const result = await api.importSchedule(file);
      showSuccess(
        `Imported: ${result.updatedEntries} entries, ${result.createdStaff} new staff` +
          (result.skipped ? `, ${result.skipped} skipped` : "")
      );
      api.getStaff().then(setStaff);
      api.getSchedule(toISODate(rangeStart), toISODate(rangeEnd)).then(setEntries);
    } catch (err) {
      showError(err);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleRequestTradeSubmit(proposedEntryId: number | undefined, note: string) {
    if (!tradeEntry) return;
    try {
      if (!proposedEntryId) throw new Error("Select the shift you want in exchange.");
      await api.createSwapTrade(tradeEntry.id, proposedEntryId, note || undefined);
      showSuccess("Trade request sent to your supervisor.");
    } catch (e) {
      showError(e);
    }
  }

  async function handleLogout() {
    await api.logout();
    setCurrentUser(null);
  }

  const navLabel =
    view === "month"
      ? formatMonthYear(anchorDate)
      : `${getWeekDays(anchorDate)[0].toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${getWeekDays(
          anchorDate
        )[6].toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;

  return (
    <div className="app">
      <header className="toolbar">
        <div className="toolbar-row">
          <div>
            <p className="brand">
              Sample Management Scheduling
              <small>
                SHA · Sample Management Department · {currentUser.username} ({currentUser.role})
              </small>
            </p>
          </div>
          <div className="view-toggle" role="tablist" aria-label="View mode">
            <button className={view === "week" ? "active" : ""} onClick={() => setView("week")}>
              Week
            </button>
            <button className={view === "month" ? "active" : ""} onClick={() => setView("month")}>
              Month
            </button>
          </div>
        </div>

        <div className="toolbar-row">
          <div className="nav-controls">
            <button className="icon-btn" aria-label="Previous" onClick={() => stepDate(-1)}>
              ‹
            </button>
            <span className="label">{navLabel}</span>
            <button className="icon-btn" aria-label="Next" onClick={() => stepDate(1)}>
              ›
            </button>
            <button className="btn" onClick={goToday}>
              Today
            </button>
          </div>

          <div className="btn-row">
            <button className="btn" onClick={() => setShowTradesModal(true)}>
              Trades
            </button>
            <button className="btn" onClick={() => setShowProfile(true)}>Profile</button>
            <button className="btn" onClick={() => setShowOvertime(true)}>Overtime</button>
            {isSupervisor && (
              <>
                <button className="btn" onClick={() => setShowStaffModal(true)}>
                  Staff ({staff.length})
                </button>
                <button className="btn" onClick={() => setShowBenchMetrics(true)}>Bench metrics</button>
                <button className="btn" onClick={() => fileInputRef.current?.click()}>
                  Import Excel
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xlsm"
                  onChange={handleImportFile}
                  className="visually-hidden"
                />
              </>
            )}
            <button className="btn primary" onClick={handleExport}>
              Export Excel
            </button>
            <button className="btn" onClick={handleLogout}>
              Sign out
            </button>
          </div>
        </div>
      </header>

      {status && <div className={`status-banner ${status.kind}`}>{status.text}</div>}

      <div className="legend">
        {shiftTypes.map((s) => (
          <span className="legend-chip" key={s.id}>
            <span className="dot" style={{ background: s.color }} />
            {s.name} ({s.startTime}–{s.endTime})
          </span>
        ))}
      </div>

      <main className="content">
        {view === "week" ? (
          <WeekView
            anchorDate={anchorDate}
            staff={staff}
            shiftTypes={shiftTypes}
            entries={entries}
            currentUser={currentUser}
            onAssign={handleAssign}
            onClear={handleClear}
            onRequestTrade={setTradeEntry}
            onAutoAssign={handleAutoAssignBenches}
          />
        ) : (
          <MonthView
            anchorDate={anchorDate}
            staff={staff}
            shiftTypes={shiftTypes}
            entries={entries}
            onSelectDay={setSelectedDay}
          />
        )}
      </main>

      {selectedDay && (
        <DayDetailModal
          iso={selectedDay}
          staff={staff}
          shiftTypes={shiftTypes}
          entries={entries}
          currentUser={currentUser}
          onAssign={handleAssign}
          onClear={handleClear}
          onRequestTrade={setTradeEntry}
          onClose={() => setSelectedDay(null)}
        />
      )}

      {isSupervisor && showStaffModal && (
        <StaffModal
          staff={staff}
          shiftTypes={shiftTypes}
          onAdd={handleAddStaff}
          onUpdate={handleUpdateStaff}
          onDeactivate={handleDeactivateStaff}
          onClose={() => setShowStaffModal(false)}
        />
      )}

      {showTradesModal && <TradesModal currentUser={currentUser} onClose={() => setShowTradesModal(false)} onChanged={refreshSchedule} />}

      {showProfile && (
        <ProfileModal
          user={currentUser}
          anchorDate={anchorDate}
          onSaved={(updated) => { setCurrentUser(updated); setShowProfile(false); }}
          onClose={() => setShowProfile(false)}
        />
      )}

      {showOvertime && <OvertimeModal user={currentUser} onClose={() => setShowOvertime(false)} onMessage={(text, error) => error ? showError(new Error(text)) : showSuccess(text)} />}

      {isSupervisor && showBenchMetrics && <BenchMetricsModal anchorDate={anchorDate} onClose={() => setShowBenchMetrics(false)} />}

      {tradeEntry && (
        <RequestTradeModal
          entry={tradeEntry}
          staff={staff}
          entries={entries}
          onSubmit={handleRequestTradeSubmit}
          onClose={() => setTradeEntry(null)}
        />
      )}
    </div>
  );
}
