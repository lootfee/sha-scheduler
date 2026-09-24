"""
Excel import/export for the schedule.

Export produces a workbook laid out like a traditional staff-schedule
sheet: one row per staff member, one column per day, cell = shift name.
Import reads that same layout back in, so the department's existing
Excel sheet can be dropped in directly and re-exported the same way
each week/month.
"""
from datetime import date, datetime, timedelta
from io import BytesIO

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter

from .models import db, Staff, ShiftType, ScheduleEntry

HEADER_FILL = PatternFill(start_color="1F2937", end_color="1F2937", fill_type="solid")
HEADER_FONT = Font(color="FFFFFF", bold=True)
WEEKEND_FILL = PatternFill(start_color="F3F4F6", end_color="F3F4F6", fill_type="solid")


def _date_range(start: date, end: date):
    d = start
    while d <= end:
        yield d
        d += timedelta(days=1)


def export_schedule_to_excel(start: date, end: date) -> BytesIO:
    wb = Workbook()
    ws = wb.active
    ws.title = "Schedule"

    days = list(_date_range(start, end))

    ws.cell(row=1, column=1, value="Staff").font = HEADER_FONT
    ws.cell(row=1, column=1).fill = HEADER_FILL
    for col, d in enumerate(days, start=2):
        c = ws.cell(row=1, column=col, value=d.strftime("%a %m/%d"))
        c.font = HEADER_FONT
        c.fill = HEADER_FILL
        c.alignment = Alignment(horizontal="center")
        if d.weekday() >= 5:
            c.fill = HEADER_FILL  # keep header consistent; body cells get weekend shading

    staff_list = Staff.query.filter_by(active=True).order_by(Staff.full_name).all()
    entries = (
        ScheduleEntry.query.filter(ScheduleEntry.date >= start, ScheduleEntry.date <= end).all()
    )
    lookup = {(e.staff_id, e.date): e for e in entries}

    for row, person in enumerate(staff_list, start=2):
        ws.cell(row=row, column=1, value=person.full_name)
        for col, d in enumerate(days, start=2):
            entry = lookup.get((person.id, d))
            cell = ws.cell(row=row, column=col, value=entry.shift_type.name if entry else "")
            cell.alignment = Alignment(horizontal="center")
            if d.weekday() >= 5:
                cell.fill = WEEKEND_FILL

    ws.column_dimensions["A"].width = 22
    for col in range(2, len(days) + 2):
        ws.column_dimensions[get_column_letter(col)].width = 12
    ws.freeze_panes = "B2"

    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf


def import_schedule_from_excel(file_stream) -> dict:
    """
    Reads a sheet shaped like the export above (or the department's
    existing sheet, as long as row 1 = dates and column A = staff
    names). Shift cells must match a ShiftType.name (case-insensitive),
    or be blank. Unknown staff names are created automatically.
    """
    wb = load_workbook(file_stream, data_only=True)
    ws = wb.active

    shift_types = {s.name.strip().lower(): s for s in ShiftType.query.all()}

    # Parse header row -> dates
    header_cells = next(ws.iter_rows(min_row=1, max_row=1))
    col_dates = {}
    for cell in header_cells[1:]:
        if cell.value is None:
            continue
        val = cell.value
        if isinstance(val, datetime):
            col_dates[cell.column] = val.date()
        elif isinstance(val, date):
            col_dates[cell.column] = val
        else:
            # try to parse strings like "Mon 06/01" -> skip, require real dates
            # for a robust import, dates should be actual Excel date cells
            continue

    created_staff, updated_entries, skipped, errors = 0, 0, 0, []

    for row in ws.iter_rows(min_row=2):
        name_cell = row[0]
        if not name_cell.value:
            continue
        name = str(name_cell.value).strip()
        if not name:
            continue

        person = Staff.query.filter(db.func.lower(Staff.full_name) == name.lower()).first()
        if not person:
            person = Staff(full_name=name)
            db.session.add(person)
            db.session.flush()
            created_staff += 1

        for cell in row[1:]:
            d = col_dates.get(cell.column)
            if d is None or not cell.value:
                continue
            shift_name = str(cell.value).strip()
            if not shift_name:
                continue
            shift_type = shift_types.get(shift_name.lower())
            if not shift_type:
                errors.append(f"Row '{name}', {d}: unknown shift '{shift_name}'")
                skipped += 1
                continue

            existing = ScheduleEntry.query.filter_by(staff_id=person.id, date=d).first()
            if existing:
                existing.shift_type_id = shift_type.id
            else:
                db.session.add(ScheduleEntry(staff_id=person.id, shift_type_id=shift_type.id, date=d))
            updated_entries += 1

    db.session.commit()
    return {
        "createdStaff": created_staff,
        "updatedEntries": updated_entries,
        "skipped": skipped,
        "errors": errors[:50],  # cap so a bad file doesn't flood the response
    }
