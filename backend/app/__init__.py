import os
from datetime import time
from flask import Flask, jsonify
from flask_cors import CORS

from .config import config_by_name
from .models import db, ShiftType, User, Staff

DEFAULT_SHIFTS = [
    # (name, start_time)
    ("7:45 AM", time(7, 45)),
    ("8:30 AM", time(8, 30)),
    ("9:00 AM", time(9, 0)),
    ("10:30 AM", time(10, 30)),
]

DEFAULT_COLORS = ["#4F46E5", "#0891B2", "#D97706", "#DB2777"]


def create_app(env=None):
    env = env or os.environ.get("FLASK_ENV", "development")
    app = Flask(__name__)
    app.config.from_object(config_by_name[env])

    os.makedirs(os.path.join(app.root_path, "..", "instance"), exist_ok=True)
    
    # Session cookies need to survive a page reload and, for a
    # separately-hosted frontend, be sent cross-site — hence SameSite=None
    # + Secure in production. CORS_ORIGINS must be an explicit origin
    # (not "*") for credentialed requests to work.
    app.config.update(
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",# if app.config["DEBUG"] else "None",
        SESSION_COOKIE_SECURE=False,#not app.config["DEBUG"],
    )

    db.init_app(app)
    CORS(
        app,
        resources={r"/api/*": {"origins": app.config["CORS_ORIGINS"]}},
        supports_credentials=True,
    )

    from .routes import staff, shifts, schedule, excel as excel_routes, auth, trades, overtime

    app.register_blueprint(auth.bp)
    app.register_blueprint(staff.bp)
    app.register_blueprint(shifts.bp)
    app.register_blueprint(schedule.bp)
    app.register_blueprint(excel_routes.bp)
    app.register_blueprint(trades.bp)
    app.register_blueprint(overtime.bp)

    @app.get("/api/health")
    def health():
        return jsonify({"status": "ok"})

    @app.errorhandler(404)
    def not_found(e):
        return jsonify({"error": "not found"}), 404

    @app.errorhandler(500)
    def server_error(e):
        return jsonify({"error": "internal server error"}), 500

    with app.app_context():
        db.create_all()
        _upgrade_existing_schema()
        _seed_shift_types()
        _seed_staff_defaults()
        _seed_default_supervisor()

    return app


def _seed_shift_types():
    if ShiftType.query.count() > 0:
        return
    for i, (name, start) in enumerate(DEFAULT_SHIFTS):
        db.session.add(
            ShiftType(
                name=name,
                start_time=start,
                duration_minutes=510,  # 8h30m, fixed department-wide
                color=DEFAULT_COLORS[i % len(DEFAULT_COLORS)],
            )
        )
    db.session.commit()


def _seed_staff_defaults():
    default_shift = ShiftType.query.filter_by(name="9:00 AM").first() or ShiftType.query.first()
    if not default_shift:
        return
    changed = False
    for person in Staff.query.filter_by(default_shift_type_id=None).all():
        person.default_shift_type_id = default_shift.id
        changed = True
    if changed:
        db.session.commit()


def _upgrade_existing_schema():
    inspector = db.inspect(db.engine)
    columns = {column["name"] for column in inspector.get_columns("staff")}
    additions = {
        "default_shift_type_id": "INTEGER",
        "hire_date": "DATE",
        "profile_image_url": "VARCHAR(500)",
        "weekend_call_available": "BOOLEAN NOT NULL DEFAULT 1",
    }
    with db.engine.begin() as connection:
        for name, definition in additions.items():
            if name not in columns:
                connection.exec_driver_sql(f"ALTER TABLE staff ADD COLUMN {name} {definition}")
        entry_columns = {column["name"] for column in inspector.get_columns("schedule_entries")}
        if "day_off" not in entry_columns:
            connection.exec_driver_sql("ALTER TABLE schedule_entries ADD COLUMN day_off BOOLEAN NOT NULL DEFAULT 0")
        trade_columns = {column["name"] for column in inspector.get_columns("shift_trade_requests")}
        if "proposed_entry_id" not in trade_columns:
            connection.exec_driver_sql("ALTER TABLE shift_trade_requests ADD COLUMN proposed_entry_id INTEGER")


def _seed_default_supervisor():
    """
    First-boot only: creates one supervisor login so the app isn't
    locked out of itself. CHANGE THIS PASSWORD immediately after first
    login (Staff modal has no UI for it yet — update via a DB migration
    or a short one-off script).
    """
    if User.query.count() > 0:
        return
    default_username = os.environ.get("DEFAULT_SUPERVISOR_USERNAME")
    default_password = os.environ.get("DEFAULT_SUPERVISOR_PASSWORD")
    user = User(username=default_username, role="supervisor")
    user.set_password(default_password)
    db.session.add(user)
    db.session.commit()
