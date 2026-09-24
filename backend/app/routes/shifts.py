from flask import Blueprint, jsonify
from ..models import ShiftType
from .auth import login_required

bp = Blueprint("shifts", __name__, url_prefix="/api/shift-types")


@bp.get("")
@login_required
def list_shift_types():
    shifts = ShiftType.query.order_by(ShiftType.start_time).all()
    return jsonify([s.to_dict() for s in shifts])
