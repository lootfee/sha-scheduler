import type { StaffMember, ShiftType, ScheduleEntry, CurrentUser } from "../types";
import { ShiftPicker } from "./ShiftPicker";
import { ShiftBadge } from "./ShiftBadge";
import { benchColor } from "../utils/bench";

interface Props {
  iso: string;
  staff: StaffMember[];
  shiftTypes: ShiftType[];
  entries: ScheduleEntry[];
  currentUser: CurrentUser;
  onAssign: (staffId: number, date: string, shiftTypeId: number, bench: string) => void;
  onClear: (entryId: number) => void;
  onRequestTrade: (entry: ScheduleEntry) => void;
  onClose: () => void;
}

export function DayDetailModal({
  iso,
  staff,
  shiftTypes,
  entries,
  currentUser,
  onAssign,
  onClear,
  onRequestTrade,
  onClose,
}: Props) {
  const isSupervisor = currentUser.role === "supervisor";
  const dayEntries = entries.filter((e) => e.date === iso);
  const findEntry = (staffId: number) => dayEntries.find((e) => e.staffId === staffId);
  const benchColorFor = (entry: ScheduleEntry | undefined) =>
    entry ? benchColor(entry.bench) : undefined;
  const shiftColorFor = (entry: ScheduleEntry | undefined) =>
    entry ? shiftTypes.find((s) => s.id === entry.shiftTypeId)?.color : undefined;
  const label = new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{label}</h2>
        <p className="sub">
          {dayEntries.length} of {staff.length} staff scheduled
        </p>

        {staff.map((person) => {
          const entry = findEntry(person.id);
          return (
            <div className="modal-row" key={person.id}>
              <span>{person.fullName}</span>
              {isSupervisor ? (
                <ShiftPicker
                  shiftTypes={shiftTypes}
                  entry={entry}
                  onAssign={(shiftTypeId, bench) => onAssign(person.id, iso, shiftTypeId, bench)}
                  onClear={() => entry && onClear(entry.id)}
                />
              ) : (
                <ShiftBadge
                  entry={entry}
                  currentUser={currentUser}
                  benchColor={benchColorFor(entry)}
                  shiftColor={shiftColorFor(entry)}
                  onRequestTrade={onRequestTrade}
                />
              )}
            </div>
          );
        })}

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
