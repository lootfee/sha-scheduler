from datetime import datetime, timedelta
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash

db = SQLAlchemy()


class User(db.Model):
    """
    Login account. Kept separate from Staff so a supervisor account
    doesn't have to correspond to a schedulable person, and so a
    Staff record can exist (for historical schedules) without ever
    having had login access.
    """
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), nullable=False, default="staff")  # "staff" | "supervisor"
    staff_id = db.Column(db.Integer, db.ForeignKey("staff.id"), nullable=True)
    active = db.Column(db.Boolean, default=True, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    staff = db.relationship("Staff")

    def set_password(self, raw):
        self.password_hash = generate_password_hash(raw)

    def check_password(self, raw):
        return check_password_hash(self.password_hash, raw)

    def to_dict(self):
        return {
            "id": self.id,
            "username": self.username,
            "role": self.role,
            "staffId": self.staff_id,
            "staff": self.staff.to_dict() if self.staff else None,
        }


class Staff(db.Model):
    __tablename__ = "staff"

    id = db.Column(db.Integer, primary_key=True)
    full_name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=True)
    role = db.Column(db.String(80), default="Sample Management Tech")
    default_shift_type_id = db.Column(db.Integer, db.ForeignKey("shift_types.id"), nullable=True)
    hire_date = db.Column(db.Date, nullable=True)
    profile_image_url = db.Column(db.String(500), nullable=True)
    weekend_call_available = db.Column(db.Boolean, default=True, nullable=False)
    active = db.Column(db.Boolean, default=True, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    entries = db.relationship("ScheduleEntry", back_populates="staff", cascade="all, delete-orphan")
    default_shift = db.relationship("ShiftType", foreign_keys=[default_shift_type_id])

    def to_dict(self):
        return {
            "id": self.id,
            "fullName": self.full_name,
            "email": self.email,
            "role": self.role,
            "defaultShiftTypeId": self.default_shift_type_id,
            "defaultShiftName": self.default_shift.name if self.default_shift else None,
            "hireDate": self.hire_date.isoformat() if self.hire_date else None,
            "profileImageUrl": self.profile_image_url,
            "weekendCallAvailable": self.weekend_call_available,
            "initials": "".join(part[0] for part in self.full_name.split()[:2]).upper(),
            "active": self.active,
        }


class ShiftType(db.Model):
    """
    A shift type is defined by its start time. Duration is fixed at
    8h30m department-wide (see Config.SHIFT_DURATION), so end time is
    always derived rather than stored twice.
    """
    __tablename__ = "shift_types"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(40), nullable=False, unique=True)  # e.g. "7:45 AM"
    start_time = db.Column(db.Time, nullable=False)
    duration_minutes = db.Column(db.Integer, nullable=False, default=510)  # 8h30m
    color = db.Column(db.String(7), default="#4F46E5")  # UI hint, hex color

    entries = db.relationship("ScheduleEntry", back_populates="shift_type")

    @property
    def end_time(self):
        dummy_date = datetime(2000, 1, 1, self.start_time.hour, self.start_time.minute)
        end = dummy_date + timedelta(minutes=self.duration_minutes)
        return end.time()

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "startTime": self.start_time.strftime("%H:%M"),
            "endTime": self.end_time.strftime("%H:%M"),
            "durationMinutes": self.duration_minutes,
            "color": self.color,
        }


class ScheduleEntry(db.Model):
    __tablename__ = "schedule_entries"
    __table_args__ = (
        db.UniqueConstraint("staff_id", "date", name="uq_staff_date"),
    )

    id = db.Column(db.Integer, primary_key=True)
    staff_id = db.Column(db.Integer, db.ForeignKey("staff.id"), nullable=False)
    shift_type_id = db.Column(db.Integer, db.ForeignKey("shift_types.id"), nullable=False)
    date = db.Column(db.Date, nullable=False, index=True)
    notes = db.Column(db.String(255), nullable=True)
    bench = db.Column(db.String(80), nullable=True)  # e.g. "Receiving", "Accessioning", "Processing"
    day_off = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    staff = db.relationship("Staff", back_populates="entries")
    shift_type = db.relationship("ShiftType", back_populates="entries")

    def to_dict(self):
        return {
            "id": self.id,
            "staffId": self.staff_id,
            "staffName": self.staff.full_name if self.staff else None,
            "shiftTypeId": self.shift_type_id,
            "shiftName": self.shift_type.name if self.shift_type else None,
            "date": self.date.isoformat(),
            "notes": self.notes,
            "bench": self.bench,
            "dayOff": self.day_off,
        }


class ShiftTradeRequest(db.Model):
    """
    A staff member asks to give away their assigned shift, optionally
    to a specific coworker. A supervisor approves or denies; approving
    reassigns the underlying ScheduleEntry.
    """
    __tablename__ = "shift_trade_requests"

    id = db.Column(db.Integer, primary_key=True)
    entry_id = db.Column(db.Integer, db.ForeignKey("schedule_entries.id"), nullable=False)
    proposed_entry_id = db.Column(db.Integer, db.ForeignKey("schedule_entries.id"), nullable=True)
    requested_by_staff_id = db.Column(db.Integer, db.ForeignKey("staff.id"), nullable=False)
    proposed_staff_id = db.Column(db.Integer, db.ForeignKey("staff.id"), nullable=True)
    status = db.Column(db.String(20), nullable=False, default="pending")  # pending | approved | denied | cancelled
    note = db.Column(db.String(255), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    resolved_at = db.Column(db.DateTime, nullable=True)
    resolved_by_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)

    entry = db.relationship("ScheduleEntry", foreign_keys=[entry_id])
    proposed_entry = db.relationship("ScheduleEntry", foreign_keys=[proposed_entry_id])
    requested_by = db.relationship("Staff", foreign_keys=[requested_by_staff_id])
    proposed_staff = db.relationship("Staff", foreign_keys=[proposed_staff_id])
    resolved_by = db.relationship("User")

    def to_dict(self):
        proposed_staff = self.proposed_staff or (self.proposed_entry.staff if self.proposed_entry else None)
        return {
            "id": self.id,
            "entryId": self.entry_id,
            "proposedEntryId": self.proposed_entry_id,
            "proposedDate": self.proposed_entry.date.isoformat() if self.proposed_entry else None,
            "date": self.entry.date.isoformat() if self.entry else None,
            "shiftName": self.entry.shift_type.name if self.entry and self.entry.shift_type else None,
            "requestedByStaffId": self.requested_by_staff_id,
            "requestedByName": self.requested_by.full_name if self.requested_by else None,
            "proposedStaffId": self.proposed_staff_id or (self.proposed_entry.staff_id if self.proposed_entry else None),
            "proposedStaffName": proposed_staff.full_name if proposed_staff else None,
            "status": self.status,
            "note": self.note,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
        }


class OvertimeSlot(db.Model):
    __tablename__ = "overtime_slots"
    __table_args__ = (db.UniqueConstraint("date", name="uq_overtime_date"),)

    id = db.Column(db.Integer, primary_key=True)
    date = db.Column(db.Date, nullable=False, index=True)
    morning_spots = db.Column(db.Integer, nullable=False, default=0)
    late_spots = db.Column(db.Integer, nullable=False, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    bids = db.relationship("OvertimeBid", back_populates="slot", cascade="all, delete-orphan")

    @property
    def deadline(self):
        return datetime.combine(self.date - timedelta(days=1), datetime.min.time()).replace(hour=16)

    def to_dict(self):
        sorted_bids = sorted(
            self.bids,
            key=lambda item: (item.staff.hire_date or datetime.max.date(), item.created_at),
        )
        ranked_bids = []
        for shift_kind in ("morning", "late"):
            rank = 0
            for bid in (item for item in sorted_bids if item.shift_kind == shift_kind):
                rank += 1
                ranked_bids.append((bid, rank))
        return {
            "id": self.id,
            "date": self.date.isoformat(),
            "morningSpots": self.morning_spots,
            "lateSpots": self.late_spots,
            "deadline": self.deadline.isoformat(),
            "bids": [bid.to_dict(rank=rank, spot_count=self.morning_spots if bid.shift_kind == "morning" else self.late_spots) for bid, rank in ranked_bids],
        }


class OvertimeBid(db.Model):
    __tablename__ = "overtime_bids"
    __table_args__ = (db.UniqueConstraint("slot_id", "staff_id", name="uq_overtime_staff"),)

    id = db.Column(db.Integer, primary_key=True)
    slot_id = db.Column(db.Integer, db.ForeignKey("overtime_slots.id"), nullable=False)
    staff_id = db.Column(db.Integer, db.ForeignKey("staff.id"), nullable=False)
    shift_kind = db.Column(db.String(20), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    slot = db.relationship("OvertimeSlot", back_populates="bids")
    staff = db.relationship("Staff")

    def to_dict(self, rank=None, spot_count=0):
        return {
            "id": self.id,
            "staffId": self.staff_id,
            "staffName": self.staff.full_name if self.staff else None,
            "shiftKind": self.shift_kind,
            "rank": rank,
            "likelyToGet": bool(rank and rank <= spot_count),
            "createdAt": self.created_at.isoformat() if self.created_at else None,
        }
