import os
from datetime import timedelta

basedir = os.path.abspath(os.path.dirname(__file__))


class Config:
    # Swap to Postgres/MySQL in production by setting DATABASE_URL,
    # e.g. postgresql://user:pass@host:5432/sha_scheduler
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        "DATABASE_URL", f"sqlite:///{os.path.join(basedir, '..', 'instance', 'scheduler.db')}"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-change-me")
    PERMANENT_SESSION_LIFETIME = timedelta(days=14)

    # Shift duration is fixed department-wide: 8 hours 30 minutes
    SHIFT_DURATION = timedelta(hours=8, minutes=30)

    # Allowed shift start times (department policy)
    SHIFT_START_TIMES = ["07:45", "08:30", "09:00", "10:30"]

    CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "*")


class DevelopmentConfig(Config):
    DEBUG = True


class ProductionConfig(Config):
    DEBUG = False
    # In production, require an explicit DATABASE_URL rather than falling
    # back to SQLite next to the code.
    if not os.environ.get("DATABASE_URL"):
        pass  # allow SQLite fallback for small deployments, but log a warning in __init__.py


class TestingConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"


config_by_name = {
    "development": DevelopmentConfig,
    "production": ProductionConfig,
    "testing": TestingConfig,
}
