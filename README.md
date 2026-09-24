# SHA Sample Management Scheduler

A mobile-friendly scheduling app for a ~20-person sample management team.
Four fixed shift start times (7:45, 8:00, 9:00, 10:30), every shift 8h30m
long, with week and month views. Backend is Flask + SQLAlchemy; frontend
is React + TypeScript.

## Why this stack

- **Database**: SQLAlchemy ORM over SQLite by default (zero setup, a
  single file) and Postgres in production by just setting `DATABASE_URL`
  — the same code works against both, so it scales past a single Excel
  file without a rewrite.
- **Excel-friendly**: rather than using Excel *as* the database (which
  doesn't hold up under concurrent edits from 20 staff), the app reads
  and writes real `.xlsx` files at the edges via `openpyxl`:
  - **Import**: drop in the department's current spreadsheet
    (`Import Excel` button) — column A = staff name, row 1 = dates,
    cells = shift name. Unknown staff are created automatically.
  - **Export**: `Export Excel` produces a workbook in that same layout
    for the currently viewed date range, so it prints/archives the way
    people already expect.
- **Mobile-friendly**: the week grid collapses into stacked per-day
  cards below 720px; the month grid stays a compact calendar with
  color-coded coverage badges and taps into a day-detail sheet.

## Project layout

```
sha-scheduler/
  backend/           Flask API (app factory, models, routes, excel_io)
  frontend/           React + TypeScript SPA (Vite)
  docker-compose.yml  Full stack: Postgres + backend + frontend
```

## Local development

### Backend

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python run.py        # http://localhost:5000, auto-creates SQLite DB + seeds shift types
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env   # VITE_API_URL=http://localhost:5000
npm run dev             # http://localhost:5173
```

Open the dev URL on your phone (same Wi-Fi, use your machine's LAN IP
instead of localhost) to check the mobile layout.

## Signing in

First boot seeds one login so the app isn't locked out of itself:

- username `supervisor`, password `changeme123`
  (override with `DEFAULT_SUPERVISOR_USERNAME` / `DEFAULT_SUPERVISOR_PASSWORD`
  env vars before the first run — **change the password immediately**
  either way; there's no in-app "change password" UI yet, so do it via
  a one-off script using `User.set_password()`).

Two roles:
- **supervisor** — full edit access: assign/clear shifts directly, add
  staff, import/export Excel, approve or deny trade requests.
- **staff** — read-only schedule view, plus a "Trades" button to
  request giving away one of their own shifts (optionally naming a
  coworker to take it). A supervisor has to approve before it moves.

To create staff logins, add rows to the `users` table linking
`staff_id` to the matching `Staff` record — there's no self-serve
signup by design for an internal 20-person team.

## Data model

- **User** — login account (username/password hash, role). Optionally
  linked to a `Staff` record via `staff_id` so a staff login can tell
  "my own shifts" apart from everyone else's.
- **Staff** — name, role, active flag (soft-deleted on removal so past
  schedules stay intact).
- **ShiftType** — seeded once on first boot: 7:45 AM, 8:00 AM, 9:00 AM,
  10:30 AM, each 510 minutes (8h30m) long. Change `DEFAULT_SHIFTS` in
  `backend/app/__init__.py` if start times ever change.
- **ScheduleEntry** — one row per staff member per date (unique
  constraint enforces one shift/day/person), linking to a `ShiftType`.
  Has an optional `bench` field (e.g. "Receiving", "Accessioning") for
  tracking which station someone's covering within a shift — settable
  by a supervisor when assigning; not yet round-tripped through the
  Excel import/export.
- **ShiftTradeRequest** — a staff member's ask to give away a shift,
  optionally to a named coworker; a supervisor approves (reassigns the
  `ScheduleEntry`) or denies.

## API

All `/api/*` routes except `/api/auth/*` and `/api/health` require a
logged-in session; routes marked **sup** additionally require the
`supervisor` role.

| Method | Path                                | Purpose                            |
|--------|-------------------------------------|-------------------------------------|
| POST   | `/api/auth/login`                   | Sign in, starts a session cookie    |
| POST   | `/api/auth/logout`                  | Sign out                            |
| GET    | `/api/auth/me`                      | Current session's user, or null     |
| GET    | `/api/staff`                        | List active staff                   |
| POST   | `/api/staff` **sup**                | Add staff                           |
| PUT    | `/api/staff/:id` **sup**            | Edit staff                          |
| DELETE | `/api/staff/:id` **sup**            | Soft-deactivate staff               |
| GET    | `/api/shift-types`                  | The 4 fixed shifts                  |
| GET    | `/api/schedule?start=&end=`         | Entries in a date range             |
| POST   | `/api/schedule` **sup**             | Assign/replace a staff+date shift   |
| DELETE | `/api/schedule/:id` **sup**         | Clear an assignment                 |
| GET    | `/api/schedule/export?start=&end=`  | Download `.xlsx` for the range      |
| POST   | `/api/schedule/import` **sup**      | Upload `.xlsx` (multipart `file`)   |
| GET    | `/api/trades?status=`               | List trade requests                 |
| POST   | `/api/trades`                       | Request giving away your own shift  |
| POST   | `/api/trades/:id/approve` **sup**   | Approve — reassigns the shift       |
| POST   | `/api/trades/:id/deny` **sup**      | Deny                                |
| POST   | `/api/trades/:id/cancel`            | Requester withdraws a pending one   |

## Production deployment

```bash
docker compose up -d --build
```

This runs Postgres, the Flask API behind gunicorn, and the built React
app behind nginx. Before deploying for real:

1. Set real `SECRET_KEY` / `POSTGRES_PASSWORD` values in
   `docker-compose.yml` or via a `.env` file (don't commit real
   secrets).
2. Set `VITE_API_URL` to your backend's public URL **before** building
   the frontend image — Vite bakes it in at build time. Pass it as a
   Docker build arg if backend and frontend live on different hosts.
3. Put both services behind HTTPS (a reverse proxy like Caddy or your
   cloud provider's load balancer) — this scaffold serves plain HTTP.
4. Lock `CORS_ORIGINS` down to your actual frontend origin.
5. Add authentication before exposing this outside your internal
   network — this scaffold has no login yet, which is fine behind SHA's
   VPN/intranet but not for anything public.

## Extending further

- **Bench in Excel**: the export/import currently only round-trips the
  shift name per cell. If bench tracking becomes important on the
  sheet itself, extend `excel_io.py` to write `"ShiftName (Bench)"` and
  parse it back out on import.
- **Password reset / user management UI**: right now `User` rows are
  managed by hand (a script or a DB console). A small admin screen for
  supervisors to create staff logins and reset passwords is a natural
  next step.
- **Multiple bench assignments per shift**: if a person can move
  between benches within one shift, a separate `BenchAssignment` table
  (entry_id, bench, start_time, end_time) scales better than the
  single `bench` column on `ScheduleEntry`.
