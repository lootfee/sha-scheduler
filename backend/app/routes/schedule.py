from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify
from sqlalchemy.exc import IntegrityError
from ..models import db, ScheduleEntry, ShiftType, Staff
from .auth import login_required, supervisor_required

bp = Blueprint("schedule", __name__, url_prefix="/api/schedule")


def _parse_date(s):
    return datetime.strptime(s, "%Y-%m-%d").date()


@bp.get("")
@login_required
def get_schedule():
    """
    Returns all entries between ?start=YYYY-MM-DD&end=YYYY-MM-DD
    (inclusive). The frontend derives week/month views from this same
    endpoint by choosing the date range.
    """
    start_str = request.args.get("start")
    end_str = request.args.get("end")
    if not start_str or not end_str:
        return jsonify({"error": "start and end query params (YYYY-MM-DD) are required"}), 400

    try:
        start = _parse_date(start_str)
        end = _parse_date(end_str)
    except ValueError:
        return jsonify({"error": "dates must be YYYY-MM-DD"}), 400

    _materialize_defaults(start, end)
    entries = (
        ScheduleEntry.query.filter(ScheduleEntry.date >= start, ScheduleEntry.date <= end)
        .order_by(ScheduleEntry.date)
        .all()
    )
    return jsonify([e.to_dict() for e in entries])


def _materialize_defaults(start, end):
    people = Staff.query.filter_by(active=True).all()
    existing = {(entry.staff_id, entry.date) for entry in ScheduleEntry.query.filter(ScheduleEntry.date >= start, ScheduleEntry.date <= end).all()}
    changed = False
    current = start
    while current <= end:
        if current.weekday() < 5:
            for person in people:
                if person.default_shift_type_id and (person.id, current) not in existing:
                    db.session.add(ScheduleEntry(staff_id=person.id, shift_type_id=person.default_shift_type_id, date=current))
                    existing.add((person.id, current))
                    changed = True
        current += timedelta(days=1)
    if changed:
        db.session.commit()


@bp.post("")
@supervisor_required
def upsert_entry():
    """
    Create or replace the assignment for a given staff member + date.
    One staff member has at most one shift per day. Direct edits are
    supervisor-only; staff use /api/trades to request a change to
    their own assigned shift.
    """
    data = request.get_json(force=True) or {}
    try:
        staff_id = int(data["staffId"])
        shift_type_id = int(data["shiftTypeId"])
        entry_date = _parse_date(data["date"])
    except (KeyError, ValueError, TypeError):
        return jsonify({"error": "staffId, shiftTypeId, date (YYYY-MM-DD) are required"}), 400

    if not Staff.query.get(staff_id):
        return jsonify({"error": "unknown staffId"}), 404
    if not ShiftType.query.get(shift_type_id):
        return jsonify({"error": "unknown shiftTypeId"}), 404

    entry = ScheduleEntry.query.filter_by(staff_id=staff_id, date=entry_date).first()
    if entry:
        entry.shift_type_id = shift_type_id
        entry.day_off = False
        entry.notes = data.get("notes", entry.notes)
        entry.bench = data.get("bench", entry.bench)
    else:
        entry = ScheduleEntry(
            staff_id=staff_id,
            shift_type_id=shift_type_id,
            date=entry_date,
            notes=data.get("notes"),
            bench=data.get("bench"),
            day_off=False,
        )
        db.session.add(entry)

    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({"error": "conflict saving entry"}), 409

    return jsonify(entry.to_dict()), 200


@bp.post("/auto-bench")
@supervisor_required
def auto_assign_benches():
    data = request.get_json(force=True) or {}
    try:
        start = _parse_date(data["start"])
        end = _parse_date(data["end"])
    except (KeyError, TypeError, ValueError):
        return jsonify({"error": "start and end (YYYY-MM-DD) are required"}), 400
    if end < start or (end - start).days > 6:
        return jsonify({"error": "auto-assignment must cover one week or less"}), 400

    seven_forty_five = ShiftType.query.filter_by(name="7:45 AM").first()
    constrained = [
        ("Softlab DE", 2),
        ("Labware DE", 2),
        ("Low Vol DE", 2),
        ("CRC", 1),
        ("Frozens Accession", 1),
        ("Frozens Data Entry", 1),
        ("Frozens Float", 1),
        ("Tracking", 1),
        ("Mail", 2),
        ("Sorting", 2),
        ("Accession", 2),
    ]
    month_start = start.replace(day=1)
    month_end = (month_start.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)
    monthly_counts = {}
    for entry in ScheduleEntry.query.filter(
        ScheduleEntry.date >= month_start,
        ScheduleEntry.date <= month_end,
        ScheduleEntry.day_off.is_(False),
        ~ScheduleEntry.date.between(start, end),
    ).all():
        if entry.bench:
            monthly_counts.setdefault(entry.staff_id, {})[entry.bench] = monthly_counts.setdefault(entry.staff_id, {}).get(entry.bench, 0) + 1
    changed = 0
    last_bench = {}
    previous_date = start - timedelta(days=1)
    previous_entries = (
        ScheduleEntry.query.filter(ScheduleEntry.date == previous_date, ScheduleEntry.day_off.is_(False)).all()
    )
    for entry in previous_entries:
        last_bench[entry.staff_id] = entry.bench
    current = start
    while current <= end:
        working = (
            ScheduleEntry.query.join(Staff)
            .filter(ScheduleEntry.date == current, ScheduleEntry.day_off.is_(False), Staff.active.is_(True))
            .order_by(Staff.hire_date.asc().nullslast(), Staff.full_name.asc())
            .all()
        )
        available = list(working)
        for entry in working:
            entry.bench = None

        if seven_forty_five:
            candidates = [entry for entry in available if entry.shift_type_id == seven_forty_five.id]
            if candidates:
                customer_service = min(candidates, key=lambda entry: monthly_counts.get(entry.staff_id, {}).get("Customer Service", 0))
                customer_service.bench = "Customer Service"
                available.remove(customer_service)

        for bench, capacity in constrained:
            candidates = sorted(
                available,
                key=lambda entry: (
                    monthly_counts.get(entry.staff_id, {}).get(bench, 0) / capacity,
                    last_bench.get(entry.staff_id) == bench,
                    monthly_counts.get(entry.staff_id, {}).get(bench, 0),
                    entry.staff.hire_date or datetime.max.date(),
                    entry.staff.full_name,
                ),
            )
            for entry in candidates[:capacity]:
                entry.bench = bench
                available.remove(entry)
                monthly_counts.setdefault(entry.staff_id, {})[bench] = monthly_counts.setdefault(entry.staff_id, {}).get(bench, 0) + 1

        for entry in available:
            entry.bench = "Float"
            monthly_counts.setdefault(entry.staff_id, {})["Float"] = monthly_counts.setdefault(entry.staff_id, {}).get("Float", 0) + 1
        for entry in working:
            last_bench[entry.staff_id] = entry.bench
            if entry.bench == "Customer Service":
                monthly_counts.setdefault(entry.staff_id, {})[entry.bench] = monthly_counts.setdefault(entry.staff_id, {}).get(entry.bench, 0) + 1
        changed += len(working)
        current += timedelta(days=1)

    db.session.commit()
    entries = ScheduleEntry.query.filter(ScheduleEntry.date >= start, ScheduleEntry.date <= end).order_by(ScheduleEntry.date).all()
    return jsonify({"updated": changed, "entries": [entry.to_dict() for entry in entries]})


@bp.get("/bench-metrics")
@supervisor_required
def bench_metrics():
    try:
        start = _parse_date(request.args["start"])
        end = _parse_date(request.args["end"])
    except (KeyError, TypeError, ValueError):
        return jsonify({"error": "start and end (YYYY-MM-DD) are required"}), 400

    people = Staff.query.filter_by(active=True).order_by(Staff.full_name).all()
    entries = ScheduleEntry.query.filter(
        ScheduleEntry.date >= start,
        ScheduleEntry.date <= end,
        ScheduleEntry.day_off.is_(False),
    ).all()
    entries_by_staff = {}
    for entry in entries:
        if entry.bench:
            entries_by_staff.setdefault(entry.staff_id, []).append(entry)

    result = []
    for person in people:
        counts = {}
        for entry in entries_by_staff.get(person.id, []):
            counts[entry.bench] = counts.get(entry.bench, 0) + 1
        total = sum(counts.values())
        result.append({
            "staffId": person.id,
            "staffName": person.full_name,
            "hireDate": person.hire_date.isoformat() if person.hire_date else None,
            "totalAssignedDays": total,
            "benches": [{"bench": bench, "days": days, "percentage": round(days / total * 100, 1) if total else 0} for bench, days in sorted(counts.items(), key=lambda item: (-item[1], item[0]))],
        })
    return jsonify({"start": start.isoformat(), "end": end.isoformat(), "staff": result})


@bp.delete("/<int:entry_id>")
@supervisor_required
def delete_entry(entry_id):
    entry = ScheduleEntry.query.get_or_404(entry_id)
    is_weekday = entry.date.weekday() < 5
    if is_weekday:
        # Keep a weekday exception so the default shift is not recreated.
        entry.day_off = True
        entry.bench = None
    else:
        # Weekends are off by default and need no exception record.
        db.session.delete(entry)
    db.session.commit()
    return jsonify({"ok": True, "entry": entry.to_dict() if is_weekday else None})
