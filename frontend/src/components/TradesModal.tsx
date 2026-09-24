import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { CurrentUser, TradeRequest } from "../types";

interface Props {
  currentUser: CurrentUser;
  onClose: () => void;
  onChanged: () => Promise<void>;
}

export function TradesModal({ currentUser, onClose, onChanged }: Props) {
  const [trades, setTrades] = useState<TradeRequest[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);
  const isSupervisor = currentUser.role === "supervisor";

  useEffect(() => {
    load();
  }, []);

  function load() {
    api.getTrades().then(setTrades).catch(() => {});
  }

  async function act(id: number, action: "approve" | "deny" | "cancel") {
    setBusyId(id);
    try {
      if (action === "approve") await api.approveTrade(id);
      if (action === "deny") await api.denyTrade(id);
      if (action === "cancel") await api.cancelTrade(id);
      await onChanged();
      load();
    } finally {
      setBusyId(null);
    }
  }

  const pending = trades.filter((t) => t.status === "pending");
  const resolved = trades.filter((t) => t.status !== "pending");

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Shift trade requests</h2>
        <p className="sub">
          {isSupervisor
            ? "Approve or deny requests below. Approving reassigns the shift immediately."
            : "Requests you can cancel while they're still pending."}
        </p>

        {pending.length === 0 && <p className="empty-state">No pending requests.</p>}

        {pending.map((t) => (
          <div className="modal-row" key={t.id} style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}>
            <div style={{ fontSize: 13 }}>
              <strong>{t.requestedByName}</strong> wants to trade {" "}
              {new Date(`${t.date}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })} shift
              {t.proposedEntryId ? (
                <> in exchange for <strong>{t.proposedStaffName}</strong>'s {new Date(`${t.proposedDate}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })} shift</>
              ) : t.proposedStaffName ? (
                <>
                  {" "}
                  to <strong>{t.proposedStaffName}</strong>
                </>
              ) : (
                " — no coworker proposed yet"
              )}
              {t.note && <div style={{ color: "var(--ink-soft)", fontSize: 12 }}>"{t.note}"</div>}
            </div>
            <div className="btn-row">
              {isSupervisor ? (
                <>
                  <button
                    className="btn primary"
                    disabled={busyId === t.id || (!t.proposedStaffId && !t.proposedEntryId)}
                    onClick={() => act(t.id, "approve")}
                  >
                    Approve
                  </button>
                  <button className="btn" disabled={busyId === t.id} onClick={() => act(t.id, "deny")}>
                    Deny
                  </button>
                </>
              ) : (
                t.requestedByStaffId === currentUser.staffId && (
                  <button className="btn" disabled={busyId === t.id} onClick={() => act(t.id, "cancel")}>
                    Withdraw
                  </button>
                )
              )}
            </div>
          </div>
        ))}

        {resolved.length > 0 && (
          <>
            <p className="sub" style={{ marginTop: 16 }}>
              Recent history
            </p>
            {resolved.slice(0, 10).map((t) => (
              <div className="modal-row" key={t.id}>
                <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                  {t.requestedByName} · {t.shiftName} · {t.date}
                </span>
                <span style={{ fontSize: 12, fontWeight: 600 }}>{t.status}</span>
              </div>
            ))}
          </>
        )}

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
