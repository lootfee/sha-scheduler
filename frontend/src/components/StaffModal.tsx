import { useState } from "react";
import type { StaffMember, ShiftType } from "../types";

interface Props {
  staff: StaffMember[];
  shiftTypes: ShiftType[];
  onAdd: (name: string) => Promise<void>;
  onUpdate: (id: number, patch: Partial<StaffMember>) => Promise<void>;
  onDeactivate: (id: number) => Promise<void>;
  onClose: () => void;
}

export function StaffModal({ staff, shiftTypes, onAdd, onUpdate, onDeactivate, onClose }: Props) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const handleAdd = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      await onAdd(trimmed);
      setName("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Staff roster</h2>
        <p className="sub">{staff.length} active staff</p>

        <div className="modal-row">
          <input
            type="text"
            placeholder="Full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            style={{ flex: 1, padding: "6px 8px", border: "1px solid var(--border)", borderRadius: 6 }}
          />
          <button className="btn primary" onClick={handleAdd} disabled={busy}>
            Add
          </button>
        </div>

        {staff.map((person) => (
          <div className="modal-row" key={person.id}>
            <span className="staff-edit-fields"><strong>{person.fullName}</strong><select value={person.defaultShiftTypeId || ""} onChange={(event) => onUpdate(person.id, { defaultShiftTypeId: event.target.value ? Number(event.target.value) : null })}><option value="">No default</option>{shiftTypes.map((shift) => <option key={shift.id} value={shift.id}>{shift.name}</option>)}</select><input type="date" value={person.hireDate || ""} onChange={(event) => onUpdate(person.id, { hireDate: event.target.value || null })} /></span>
            <button className="btn" onClick={() => onDeactivate(person.id)}>
              Remove
            </button>
          </div>
        ))}

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
