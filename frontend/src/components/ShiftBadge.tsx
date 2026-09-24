import type { ScheduleEntry, CurrentUser } from "../types";

interface Props {
  entry: ScheduleEntry | undefined;
  currentUser: CurrentUser;
  benchColor: string | undefined;
  shiftColor: string | undefined;
  onRequestTrade: (entry: ScheduleEntry) => void;
}

export function ShiftBadge({ entry, currentUser, benchColor, shiftColor, onRequestTrade }: Props) {
  if (!entry) {
    return <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>—</span>;
  }

  if (entry.dayOff) {
    return <span className="day-off-label">Off</span>;
  }

  const isMine = entry.staffId === currentUser.staffId;

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "var(--ink)",
          background: "transparent",
          border: `2px solid ${shiftColor || "#888"}`,
          borderRadius: 4,
          padding: "2px 6px",
        }}
      >
        {entry.shiftName}
      </span>
      {entry.bench && <span className="bench-label" style={{ background: benchColor || "#888", borderColor: benchColor || "#888", color: "#fff" }}>{entry.bench}</span>}
      {isMine && (
        <button
          className="icon-btn"
          style={{ width: 24, height: 24, fontSize: 12 }}
          title="Request a trade for this shift"
          onClick={() => onRequestTrade(entry)}
        >
          ↔
        </button>
      )}
    </span>
  );
}
