from functools import wraps
from flask import Blueprint, request, jsonify, session
from ..models import db, User

bp = Blueprint("auth", __name__, url_prefix="/api/auth")


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not session.get("user_id"):
            return jsonify({"error": "authentication required"}), 401
        return fn(*args, **kwargs)

    return wrapper


def supervisor_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not session.get("user_id"):
            return jsonify({"error": "authentication required"}), 401
        if session.get("role") != "supervisor":
            return jsonify({"error": "supervisor access required"}), 403
        return fn(*args, **kwargs)

    return wrapper


@bp.post("/login")
def login():
    data = request.get_json(force=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    user = User.query.filter_by(username=username, active=True).first()
    if not user or not user.check_password(password):
        return jsonify({"error": "invalid username or password"}), 401

    session["user_id"] = user.id
    session["role"] = user.role
    session.permanent = True
    return jsonify(user.to_dict())


@bp.post("/logout")
def logout():
    session.clear()
    return jsonify({"ok": True})


@bp.get("/me")
def me():
    user_id = session.get("user_id")
    if not user_id:
        return jsonify(None)
    user = User.query.get(user_id)
    return jsonify(user.to_dict() if user else None)
