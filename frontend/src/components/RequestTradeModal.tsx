import { useState } from "react";
import type { ScheduleEntry, StaffMember } from "../types";

interface Props {
  entry: ScheduleEntry;
  staff: StaffMember[];
  entries: ScheduleEntry[];
  onSubmit: (proposedEntryId: number | undefined, note: string) => Promise<void>;
  onClose: () => void;
}

export function RequestTradeModal({ entry, staff, entries, onSubmit, onClose }: Props) {
  const [proposedEntryId, setProposedEntryId] = useState<string>("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const tradeTargets = entries.filter((item) => item.staffId !== entry.staffId && item.date !== entry.date);

  async function handleSubmit() {
    setBusy(true);
    try {
      await onSubmit(proposedEntryId ? Number(proposedEntryId) : undefined, note);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Request a shift trade</h2>
        <p className="sub">
          {entry.shiftName} on {new Date(`${entry.date}T00:00:00`).toLocaleDateString(undefined, {
            weekday: "long",
            month: "short",
            day: "numeric",
          })}
        </p>

        <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>
          Exchange for this coworker's shift
        </label>
        <select
          value={proposedEntryId}
          onChange={(e) => setProposedEntryId(e.target.value)}
          style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 6, marginBottom: 12 }}
        >
          <option value="">— Select a shift —</option>
          {tradeTargets.map((target) => (
            <option key={target.id} value={target.id}>
              {staff.find((person) => person.id === target.staffId)?.fullName || "Staff"} · {target.date} · {target.shiftName} · {target.bench || ""}
            </option>
          ))}
        </select>

        <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Note (optional)</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 6, marginBottom: 12 }}
        />

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={handleSubmit} disabled={busy}>
            {busy ? "Sending…" : "Send request"}
          </button>
        </div>
      </div>
    </div>
  );
}
