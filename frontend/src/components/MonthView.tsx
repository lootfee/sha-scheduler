import type { ScheduleEntry, ShiftType, StaffMember } from "../types";
import { getMonthGridDays, toISODate, WEEKDAY_LABELS } from "../utils/date";

interface Props {
  anchorDate: Date;
  staff: StaffMember[];
  shiftTypes: ShiftType[];
  entries: ScheduleEntry[];
  onSelectDay: (iso: string) => void;
}

export function MonthView({ anchorDate, staff, shiftTypes, entries, onSelectDay }: Props) {
  const days = getMonthGridDays(anchorDate);
  const todayIso = toISODate(new Date());
  const month = anchorDate.getMonth();

  const entriesByDay: Record<string, ScheduleEntry[]> = {};
  for (const e of entries) {
    (entriesByDay[e.date] ||= []).push(e);
  }

  return (
    <div className="month-grid">
      {WEEKDAY_LABELS.map((label) => (
        <div className="month-weekday-label" key={label}>
          {label}
        </div>
      ))}
      {days.map((d) => {
        const iso = toISODate(d);
        const dayEntries = entriesByDay[iso] || [];
        const statuses = staff.map((person) => {
          const entry = dayEntries.find((item) => item.staffId === person.id);
          const isHoliday = entry?.bench?.toLowerCase() === "holiday" && !entry.dayOff;
          const shift = entry && !entry.dayOff ? shiftTypes.find((item) => item.id === entry.shiftTypeId) : undefined;
          return { person, entry, isHoliday, shift };
        }).sort((a, b) => {
          if (!a.entry || a.entry.dayOff) return 1;
          if (!b.entry || b.entry.dayOff) return -1;
          return (a.shift?.startTime || "99:99").localeCompare(b.shift?.startTime || "99:99");
        });
        const classes = [
          "month-cell",
          d.getMonth() !== month ? "outside" : "",
          iso === todayIso ? "today" : "",
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <button className={classes} key={iso} onClick={() => onSelectDay(iso)}>
            <span className="date-num">{d.getDate()}</span>
            <span className="shift-summary">
              {statuses.map(({ person, entry, isHoliday, shift }) => {
                if (isHoliday) return <span key={person.id} className="month-status holiday" title={`${person.fullName} · Holiday`}>{person.initials}<small>Holiday</small></span>;
                if (!entry || entry.dayOff) return <span key={person.id} className="month-status off" title={`${person.fullName} · Off`}>{person.initials}<small>Off</small></span>;
                return <span key={person.id} className="person-dot" title={`${person.fullName} · ${shift?.name || "Shift"}`} style={{ background: shift?.color || "#888" }}>{person.profileImageUrl ? <img src={person.profileImageUrl} alt={person.fullName} /> : person.initials}</span>;
              })}
            </span>
          </button>
        );
      })}
    </div>
  );
}
