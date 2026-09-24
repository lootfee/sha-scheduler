import { Fragment, useState } from "react";
import type { StaffMember, ShiftType, ScheduleEntry, CurrentUser } from "../types";
import { getWeekDays, toISODate, formatDayLabel } from "../utils/date";
import { ShiftPicker } from "./ShiftPicker";
import { ShiftBadge } from "./ShiftBadge";
import { benchColor } from "../utils/bench";

interface Props {
  anchorDate: Date;
  staff: StaffMember[];
  shiftTypes: ShiftType[];
  entries: ScheduleEntry[];
  currentUser: CurrentUser;
  onAssign: (staffId: number, date: string, shiftTypeId: number, bench: string) => void;
  onClear: (entryId: number) => void;
  onRequestTrade: (entry: ScheduleEntry) => void;
  onAutoAssign: () => Promise<void>;
}

export function WeekView(props: Props) {
  const { anchorDate, staff, shiftTypes, entries, currentUser } = props;
  const days = getWeekDays(anchorDate);
  const isSupervisor = currentUser.role === "supervisor";
  const [highlightedStaffId, setHighlightedStaffId] = useState<number | null>(null);

  const findEntry = (staffId: number, iso: string) =>
    entries.find((e) => e.staffId === staffId && e.date === iso);

  const benchColorFor = (entry: ScheduleEntry | undefined) => entry ? benchColor(entry.bench) : undefined;
  const shiftColorFor = (entry: ScheduleEntry | undefined) => entry ? shiftTypes.find((s) => s.id === entry.shiftTypeId)?.color : undefined;

  if (staff.length === 0) {
    return <p className="empty-state">No staff on file yet. Add staff to start scheduling.</p>;
  }

  return (
    <>
      {isSupervisor && <div className="week-actions"><button className="btn primary" onClick={props.onAutoAssign}>Auto-assign benches</button><span>Fills the current week using bench capacity rules.</span></div>}
      {/* Desktop/tablet grid */}
      <div className="week-grid">
        <div className="corner" />
        {days.map((d) => (
          <div key={toISODate(d)} className={`day-header${d.getDay() % 6 === 0 ? " weekend" : ""}`}>
            {formatDayLabel(d)}
          </div>
        ))}

        {staff.map((person) => (
          <Fragment key={person.id}>
            <div
              className={`staff-name-cell${highlightedStaffId === person.id ? " row-highlight" : ""}`}
              onClick={() => setHighlightedStaffId(person.id)}
              title="Highlight this staff row"
            >
              {person.fullName}
            </div>
            {days.map((d) => {
              const iso = toISODate(d);
              const entry = findEntry(person.id, iso);
              return (
                <div
                  className={`cell${highlightedStaffId === person.id ? " row-highlight" : ""}`}
                  key={`${person.id}-${iso}`}
                  onClick={() => setHighlightedStaffId(person.id)}
                >
                  {isSupervisor ? (
                    <ShiftPicker
                      shiftTypes={shiftTypes}
                      entry={entry}
                      onAssign={(shiftTypeId, bench) => props.onAssign(person.id, iso, shiftTypeId, bench)}
                      onClear={() => entry && props.onClear(entry.id)}
                    />
                  ) : (
                    <ShiftBadge
                      entry={entry}
                      currentUser={currentUser}
                      benchColor={benchColorFor(entry)}
                      shiftColor={shiftColorFor(entry)}
                      onRequestTrade={props.onRequestTrade}
                    />
                  )}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>

      {/* Mobile: one card per day, listing staff */}
      <MobileWeek days={days} benchColorFor={benchColorFor} shiftColorFor={shiftColorFor} findEntry={findEntry} {...props} />
    </>
  );
}

function MobileWeek({
  days,
  staff,
  shiftTypes,
  currentUser,
  benchColorFor,
  shiftColorFor,
  findEntry,
  onAssign,
  onClear,
  onRequestTrade,
}: Props & {
  days: Date[];
  benchColorFor: (entry: ScheduleEntry | undefined) => string | undefined;
  shiftColorFor: (entry: ScheduleEntry | undefined) => string | undefined;
  findEntry: (staffId: number, iso: string) => ScheduleEntry | undefined;
}) {
  const isSupervisor = currentUser.role === "supervisor";

  return (
    <div className="week-grid-mobile-wrapper">
      {days.map((d) => {
        const iso = toISODate(d);
        return (
          <div className="week-day-card" key={iso}>
            <div className="day-title">{formatDayLabel(d)}</div>
            {staff.map((person) => {
              const entry = findEntry(person.id, iso);
              return (
                <div className="staff-row" key={person.id}>
                  <span className="staff-row-name">{person.fullName}</span>
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
          </div>
        );
      })}
    </div>
  );
}
