import { useEffect, useState } from "react";
import type { CurrentUser, ScheduleEntry } from "../types";
import { api } from "../api/client";
import { endOfMonth, formatMonthYear, startOfMonth, toISODate } from "../utils/date";

interface Props {
  user: CurrentUser;
  anchorDate: Date;
  onSaved: (user: CurrentUser) => void;
  onClose: () => void;
}

export function ProfileModal({ user, anchorDate, onSaved, onClose }: Props) {
  const [weekendCallAvailable, setWeekendCallAvailable] = useState(user.staff?.weekendCallAvailable ?? true);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [monthEntries, setMonthEntries] = useState<ScheduleEntry[]>([]);

  useEffect(() => {
    if (!user.staffId) return;
    api.getSchedule(toISODate(startOfMonth(anchorDate)), toISODate(endOfMonth(anchorDate)))
      .then((entries) => setMonthEntries(entries.filter((entry) => entry.staffId === user.staffId && !entry.dayOff)))
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load monthly metrics"));
  }, [anchorDate, user.staffId]);

  const benchCounts = monthEntries.reduce<Record<string, number>>((counts, entry) => {
    if (entry.bench) counts[entry.bench] = (counts[entry.bench] || 0) + 1;
    return counts;
  }, {});
  const assignedBenchDays = Object.values(benchCounts).reduce((total, count) => total + count, 0);
  const benchMetrics = Object.entries(benchCounts).sort(([, a], [, b]) => b - a);

  async function save() {
    setBusy(true);
    setError("");
    try {
      const updated = await api.updateMyProfile({
        weekendCallAvailable,
        currentPassword: currentPassword || undefined,
        newPassword: newPassword || undefined,
      });
      onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save profile");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal profile-modal" onClick={(event) => event.stopPropagation()}>
        <h2>My profile</h2>
        <p className="sub">{user.staff?.fullName || user.username}</p>
        {/* Profile photo is temporarily disabled; initials remain the default identity marker. */}
        <section className="profile-section"><h3>Monthly bench metrics</h3><p className="field-help">{formatMonthYear(anchorDate)} · {assignedBenchDays} assigned bench days</p>{benchMetrics.length === 0 ? <p className="field-help">No bench assignments recorded this month.</p> : <div className="bench-metrics">{benchMetrics.map(([bench, count]) => <div className="bench-metric" key={bench}><div><strong>{bench}</strong><span>{count} day{count === 1 ? "" : "s"}</span></div><strong>{Math.round((count / assignedBenchDays) * 100)}%</strong><div className="metric-track"><span style={{ width: `${(count / assignedBenchDays) * 100}%` }} /></div></div>)}</div>}</section>
        <section className="profile-section"><h3>Weekend coverage</h3><label className="check-row"><input type="checkbox" checked={weekendCallAvailable} onChange={(event) => setWeekendCallAvailable(event.target.checked)} /> Notify me when weekend coverage is needed</label></section>
        <section className="profile-section"><h3>Change password</h3><label>Current password<input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label><label>New password<input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label></section>
        {error && <p className="error-text">{error}</p>}
        <div className="modal-actions"><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save} disabled={busy}>Save</button></div>
      </div>
    </div>
  );
}
