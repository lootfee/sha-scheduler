import type { ShiftType, ScheduleEntry } from "../types";
import { BENCHES, benchColor } from "../utils/bench";

const SORTED_BENCHES = [...BENCHES].sort((a, b) => a.localeCompare(b));

interface Props {
  shiftTypes: ShiftType[];
  entry: ScheduleEntry | undefined;
  onAssign: (shiftTypeId: number, bench: string) => void;
  onClear: () => void;
}

export function ShiftPicker({ shiftTypes, entry, onAssign, onClear }: Props) {
  const activeShift = entry && !entry.dayOff ? shiftTypes.find((s) => s.id === entry.shiftTypeId) : undefined;

  return (
    <div className="assignment-picker">
      <select
        className={`shift-select${activeShift ? " assigned" : ""}`}
        style={activeShift ? { background: "transparent", color: "var(--ink)", borderColor: activeShift.color } : undefined}
      value={entry && !entry.dayOff ? String(entry.shiftTypeId) : ""}
      onChange={(e) => {
        const val = e.target.value;
        if (val === "") {
          onClear();
        } else {
          onAssign(Number(val), entry?.bench || "");
        }
      }}
    >
      <option value="">— Off —</option>
      {shiftTypes.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name} ({s.startTime}–{s.endTime})
        </option>
      ))}
      </select>
      <select
        className="bench-select"
        aria-label="Assigned bench"
        value={entry?.bench || ""}
        style={entry?.bench ? { background: benchColor(entry.bench), borderColor: benchColor(entry.bench), color: "#fff" } : undefined}
        onChange={(event) => {
          if (entry && !entry.dayOff) onAssign(entry.shiftTypeId, event.target.value);
        }}
        disabled={!entry}
      >
        <option value="">Bench</option>
        {SORTED_BENCHES.map((bench) => <option key={bench} value={bench}>{bench}</option>)}
      </select>
    </div>
  );
}
