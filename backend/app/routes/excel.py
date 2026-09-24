from datetime import datetime
from flask import Blueprint, request, jsonify, send_file
from ..excel_io import export_schedule_to_excel, import_schedule_from_excel
from .auth import login_required, supervisor_required

bp = Blueprint("excel", __name__, url_prefix="/api/schedule")


def _parse_date(s):
    return datetime.strptime(s, "%Y-%m-%d").date()


@bp.get("/export")
@login_required
def export_excel():
    start_str = request.args.get("start")
    end_str = request.args.get("end")
    if not start_str or not end_str:
        return jsonify({"error": "start and end query params (YYYY-MM-DD) are required"}), 400
    try:
        start = _parse_date(start_str)
        end = _parse_date(end_str)
    except ValueError:
        return jsonify({"error": "dates must be YYYY-MM-DD"}), 400

    buf = export_schedule_to_excel(start, end)
    filename = f"schedule_{start.isoformat()}_to_{end.isoformat()}.xlsx"
    return send_file(
        buf,
        as_attachment=True,
        download_name=filename,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@bp.post("/import")
@supervisor_required
def import_excel():
    if "file" not in request.files:
        return jsonify({"error": "multipart file field 'file' is required"}), 400
    f = request.files["file"]
    if not f.filename.lower().endswith((".xlsx", ".xlsm")):
        return jsonify({"error": "only .xlsx/.xlsm files are supported"}), 400

    result = import_schedule_from_excel(f.stream)
    return jsonify(result)
