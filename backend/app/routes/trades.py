from datetime import datetime
from flask import Blueprint, request, jsonify, session
from ..models import db, ShiftTradeRequest, ScheduleEntry, Staff
from .auth import login_required, supervisor_required

bp = Blueprint("trades", __name__, url_prefix="/api/trades")


@bp.get("")
@login_required
def list_trades():
    status = request.args.get("status")
    q = ShiftTradeRequest.query
    if status:
        q = q.filter_by(status=status)
    trades = q.order_by(ShiftTradeRequest.created_at.desc()).all()
    return jsonify([t.to_dict() for t in trades])


@bp.post("")
@login_required
def create_trade():
    """
    Any logged-in user can propose giving away a shift. A supervisor
    must approve before it actually moves.
    """
    data = request.get_json(force=True) or {}
    entry = ScheduleEntry.query.get(data.get("entryId"))
    if not entry:
        return jsonify({"error": "unknown entryId"}), 404

    proposed_staff_id = data.get("proposedStaffId")
    if proposed_staff_id and not Staff.query.get(proposed_staff_id):
        return jsonify({"error": "unknown proposedStaffId"}), 404

    trade = ShiftTradeRequest(
        entry_id=entry.id,
        requested_by_staff_id=entry.staff_id,
        proposed_staff_id=proposed_staff_id,
        proposed_entry_id=data.get("proposedEntryId"),
        note=data.get("note"),
        status="pending",
    )
    db.session.add(trade)
    db.session.commit()
    return jsonify(trade.to_dict()), 201


@bp.post("/<int:trade_id>/approve")
@supervisor_required
def approve_trade(trade_id):
    trade = ShiftTradeRequest.query.get_or_404(trade_id)
    if trade.status != "pending":
        return jsonify({"error": f"trade already {trade.status}"}), 409
    if trade.proposed_entry_id:
        target = ScheduleEntry.query.get(trade.proposed_entry_id)
        if not target or target.staff_id == trade.entry.staff_id or target.date == trade.entry.date:
            return jsonify({"error": "invalid target entry"}), 400
        # Move ownership of the dated rows. The shift time and bench remain
        # attached to their original date, so each person inherits the other
        # person's dated shift exactly as requested.
        source_staff_id = trade.entry.staff_id
        target_staff_id = target.staff_id
        # Default weekday rows may already occupy the destination slots. They
        # are displaced by this explicit trade and must be removed first.
        displaced = ScheduleEntry.query.filter(
            ScheduleEntry.staff_id.in_([source_staff_id, target_staff_id]),
            ScheduleEntry.date.in_([trade.entry.date, target.date]),
            ScheduleEntry.id.notin_([trade.entry.id, target.id]),
        ).all()
        for entry in displaced:
            db.session.delete(entry)
        db.session.flush()
        trade.entry.staff_id = target_staff_id
        target.staff_id = source_staff_id
    elif trade.proposed_staff_id:
        trade.entry.staff_id = trade.proposed_staff_id
    else:
        return jsonify({"error": "trade needs a target staff member or entry"}), 400
    trade.status = "approved"
    trade.resolved_at = datetime.utcnow()
    trade.resolved_by_user_id = session.get("user_id")
    db.session.commit()
    return jsonify(trade.to_dict())


@bp.post("/<int:trade_id>/deny")
@supervisor_required
def deny_trade(trade_id):
    trade = ShiftTradeRequest.query.get_or_404(trade_id)
    if trade.status != "pending":
        return jsonify({"error": f"trade already {trade.status}"}), 409

    trade.status = "denied"
    trade.resolved_at = datetime.utcnow()
    trade.resolved_by_user_id = session.get("user_id")
    db.session.commit()
    return jsonify(trade.to_dict())


@bp.post("/<int:trade_id>/cancel")
@login_required
def cancel_trade(trade_id):
    """The requester can withdraw their own pending request."""
    trade = ShiftTradeRequest.query.get_or_404(trade_id)
    if trade.status != "pending":
        return jsonify({"error": f"trade already {trade.status}"}), 409
    trade.status = "cancelled"
    trade.resolved_at = datetime.utcnow()
    db.session.commit()
    return jsonify(trade.to_dict())
