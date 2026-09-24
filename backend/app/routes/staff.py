from datetime import datetime
from flask import Blueprint, request, jsonify, session
from ..models import db, Staff, User
from .auth import login_required, supervisor_required

bp = Blueprint("staff", __name__, url_prefix="/api/staff")


@bp.get("")
@login_required
def list_staff():
    active_only = request.args.get("active", "true").lower() == "true"
    q = Staff.query
    if active_only:
        q = q.filter_by(active=True)
    people = q.order_by(Staff.full_name).all()
    return jsonify([p.to_dict() for p in people])


@bp.post("")
@supervisor_required
def create_staff():
    data = request.get_json(force=True) or {}
    name = (data.get("fullName") or "").strip()
    if not name:
        return jsonify({"error": "fullName is required"}), 400

    person = Staff(
        full_name=name,
        email=data.get("email"),
        role=data.get("role", "Sample Management Tech"),
        default_shift_type_id=data.get("defaultShiftTypeId"),
        hire_date=_parse_date(data.get("hireDate")),
    )
    db.session.add(person)
    db.session.commit()
    return jsonify(person.to_dict()), 201


@bp.put("/<int:staff_id>")
@supervisor_required
def update_staff(staff_id):
    person = Staff.query.get_or_404(staff_id)
    data = request.get_json(force=True) or {}
    if "fullName" in data:
        person.full_name = data["fullName"].strip()
    if "email" in data:
        person.email = data["email"]
    if "role" in data:
        person.role = data["role"]
    if "defaultShiftTypeId" in data:
        person.default_shift_type_id = data["defaultShiftTypeId"]
    if "hireDate" in data:
        person.hire_date = _parse_date(data["hireDate"])
    if "profileImageUrl" in data:
        person.profile_image_url = data["profileImageUrl"]
    if "weekendCallAvailable" in data:
        person.weekend_call_available = bool(data["weekendCallAvailable"])
    if "active" in data:
        person.active = bool(data["active"])
    db.session.commit()
    return jsonify(person.to_dict())


@bp.delete("/<int:staff_id>")
@supervisor_required
def deactivate_staff(staff_id):
    # Soft delete: keep history intact, just stop scheduling them
    person = Staff.query.get_or_404(staff_id)
    person.active = False
    db.session.commit()
    return jsonify({"ok": True})


def _parse_date(value):
    if not value:
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return None


@bp.get("/me")
@login_required
def my_profile():
    user = User.query.get(session["user_id"])
    return jsonify(user.to_dict())


@bp.put("/me")
@login_required
def update_my_profile():
    user = User.query.get(session["user_id"])
    data = request.get_json(force=True) or {}
    if not user.staff:
        return jsonify({"error": "account is not linked to staff"}), 400
    if "profileImageUrl" in data:
        user.staff.profile_image_url = data["profileImageUrl"]
    if "weekendCallAvailable" in data:
        user.staff.weekend_call_available = bool(data["weekendCallAvailable"])
    if data.get("newPassword"):
        if not data.get("currentPassword") or not user.check_password(data["currentPassword"]):
            return jsonify({"error": "current password is incorrect"}), 400
        user.set_password(data["newPassword"])
    db.session.commit()
    return jsonify(user.to_dict())
