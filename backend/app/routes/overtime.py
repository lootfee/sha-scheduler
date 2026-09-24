from datetime import datetime
from flask import Blueprint, request, jsonify, session
from ..models import db, OvertimeSlot, OvertimeBid, User, ScheduleEntry
from .auth import login_required, supervisor_required

bp = Blueprint("overtime", __name__, url_prefix="/api/overtime")


def parse_date(value):
    return datetime.strptime(value, "%Y-%m-%d").date()


@bp.get("")
@login_required
def list_overtime():
    start = request.args.get("start")
    query = OvertimeSlot.query
    if start:
        query = query.filter(OvertimeSlot.date >= parse_date(start))
    slots = query.order_by(OvertimeSlot.date).all()
    user = User.query.get(session["user_id"])
    if user.role == "supervisor":
        return jsonify([slot.to_dict() for slot in slots])
    if not user.staff_id:
        return jsonify([])

    # A missing entry or an explicit day-off entry means the staff member is
    # available for overtime. A non-day-off entry means they are already working.
    work_dates = {
        entry.date
        for entry in ScheduleEntry.query.filter_by(staff_id=user.staff_id, day_off=False).all()
    }
    return jsonify([slot.to_dict() for slot in slots if slot.date not in work_dates])


@bp.put("/<string:date>")
@supervisor_required
def set_overtime(date):
    try:
        day = parse_date(date)
        data = request.get_json(force=True) or {}
        morning = max(0, int(data.get("morningSpots", 0)))
        late = max(0, int(data.get("lateSpots", 0)))
    except (TypeError, ValueError):
        return jsonify({"error": "date and spot counts are invalid"}), 400
    slot = OvertimeSlot.query.filter_by(date=day).first() or OvertimeSlot(date=day)
    slot.morning_spots, slot.late_spots = morning, late
    db.session.add(slot)
    db.session.commit()
    return jsonify(slot.to_dict())


@bp.post("/<int:slot_id>/bids")
@login_required
def bid_overtime(slot_id):
    slot = OvertimeSlot.query.get_or_404(slot_id)
    if datetime.now() >= slot.deadline:
        return jsonify({"error": "overtime bidding is closed"}), 409
    user = User.query.get(session["user_id"])
    if not user.staff:
        return jsonify({"error": "account is not linked to staff"}), 400
    scheduled_entry = ScheduleEntry.query.filter_by(staff_id=user.staff_id, date=slot.date).first()
    if scheduled_entry and not scheduled_entry.day_off:
        return jsonify({"error": "you are already scheduled to work on this date"}), 409
    shift_kind = (request.get_json(force=True) or {}).get("shiftKind")
    if shift_kind not in {"morning", "late"}:
        return jsonify({"error": "shiftKind must be morning or late"}), 400
    if OvertimeBid.query.filter_by(slot_id=slot.id, staff_id=user.staff_id).first():
        return jsonify({"error": "you already bid for this overtime date"}), 409
    bid = OvertimeBid(slot_id=slot.id, staff_id=user.staff_id, shift_kind=shift_kind)
    db.session.add(bid)
    db.session.commit()
    return jsonify(bid.to_dict()), 201


@bp.delete("/<int:slot_id>/bids/me")
@login_required
def cancel_overtime_bid(slot_id):
    slot = OvertimeSlot.query.get_or_404(slot_id)
    if datetime.now() >= slot.deadline:
        return jsonify({"error": "overtime bidding is closed"}), 409
    user = User.query.get(session["user_id"])
    if not user.staff_id:
        return jsonify({"error": "account is not linked to staff"}), 400
    bid = OvertimeBid.query.filter_by(slot_id=slot.id, staff_id=user.staff_id).first()
    if not bid:
        return jsonify({"error": "you have not bid for this overtime date"}), 404
    db.session.delete(bid)
    db.session.commit()
    return jsonify({"ok": True})