import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { CurrentUser, OvertimeSlot } from "../types";

interface Props { user: CurrentUser; onClose: () => void; onMessage: (text: string, error?: boolean) => void; }

export function OvertimeModal({ user, onClose, onMessage }: Props) {
  const [date, setDate] = useState("");
  const [morning, setMorning] = useState(0);
  const [late, setLate] = useState(0);
  const [slots, setSlots] = useState<OvertimeSlot[]>([]);
  const isSupervisor = user.role === "supervisor";

  async function refresh() {
    const updated = await api.getOvertime(new Date().toISOString().slice(0, 10));
    setSlots(updated);
  }

  useEffect(() => { refresh().catch((error) => onMessage(error.message, true)); }, [onMessage]);

  async function save() {
    if (!date) return;
    try { const slot = await api.setOvertime(date, morning, late); setSlots((current) => [...current.filter((item) => item.date !== date), slot].sort((a, b) => a.date.localeCompare(b.date))); onMessage("Overtime spots saved"); }
    catch (error) { onMessage(error instanceof Error ? error.message : "Unable to save overtime", true); }
  }

  async function bid(slot: OvertimeSlot, kind: "morning" | "late") {
    try { await api.bidOvertime(slot.id, kind); await refresh(); onMessage("Overtime interest recorded"); }
    catch (error) { onMessage(error instanceof Error ? error.message : "Unable to bid", true); }
  }

  async function cancelBid(slot: OvertimeSlot) {
    try { await api.cancelOvertimeBid(slot.id); await refresh(); onMessage("Overtime bid cancelled"); }
    catch (error) { onMessage(error instanceof Error ? error.message : "Unable to cancel bid", true); }
  }

  return <div className="modal-backdrop" onClick={onClose}><div className="modal overtime-modal" onClick={(event) => event.stopPropagation()}>
    <h2>Overtime spots</h2><p className="sub">Staff interest closes at 4:00 PM the day before. Morning staff use their assigned default start time; late means 10:30 AM.</p>
    {isSupervisor && <div className="overtime-editor">
      <label>Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
      <label>Morning spots<input type="number" min="0" value={morning} onChange={(event) => setMorning(Number(event.target.value))} /></label>
      <label>Late spots<input type="number" min="0" value={late} onChange={(event) => setLate(Number(event.target.value))} /></label>
      <button className="btn primary" onClick={save}>Post spots</button>
    </div>}
    {slots.length === 0 ? <p className="empty-state">No overtime spots available for you at the moment.</p> : slots.map((slot) => { const myBid = slot.bids.find((bid) => bid.staffId === user.staffId); return <div className="overtime-row" key={slot.id}><div><strong>{new Date(`${slot.date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</strong><small>Closes {new Date(slot.deadline).toLocaleString()}</small></div><span>{slot.morningSpots} morning · {slot.lateSpots} late</span>{!isSupervisor && <div className="overtime-actions">{myBid ? <><span className="bid-status">Bid placed: {myBid.shiftKind === "late" ? "Late (10:30 AM)" : "Morning"} · #{myBid.rank}</span><span className={myBid.likelyToGet ? "bid-likely" : "bid-waiting"}>{myBid.likelyToGet ? "Currently within available spots" : "Currently below available spots"}</span><button className="btn" onClick={() => cancelBid(slot)}>Cancel bid</button></> : <><button className="btn" onClick={() => bid(slot, "morning")} disabled={!slot.morningSpots}>I want morning</button><button className="btn" onClick={() => bid(slot, "late")} disabled={!slot.lateSpots}>I want late</button></>}</div>}{isSupervisor && <div className="overtime-bids"><strong>Bids ({slot.bids.length})</strong>{slot.bids.length === 0 ? <small>No bids yet.</small> : slot.bids.map((bid) => <span className="overtime-bid" key={bid.id}>#{bid.rank} {bid.staffName || "Unknown staff"} · {bid.shiftKind === "late" ? "Late (10:30 AM)" : "Morning"}{bid.likelyToGet ? " · Within spots" : " · Waitlist"}</span>)}</div>}</div>; })}
    <div className="modal-actions"><button className="btn" onClick={onClose}>Done</button></div>
  </div></div>;
}
