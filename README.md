# Secret SOC Dashboard (Python)

A full Python port of the **secret-soc-dashboard** (Node.js + React + Tailwind). This version uses:

- **FastAPI** — REST API and web server
- **Jinja2** — server-rendered HTML pages
- **Modern native CSS** design system (`app/static/css/app.css`) — no Tailwind dependency
- **Chart.js** — detection trend chart
- **PostgreSQL** — same database schema as the scanning pipeline

## Features

- Dashboard with stats and severity trend chart
- Findings table with filters, search, status updates, detail drawer, and **audit trail**
- Repository management with **live scan status** (running / completed / failed)
- Trigger scan with **scan_runs** tracking and status polling (Jenkins or mock)
- **Login page** + JWT session in browser; APIs require `Authorization: Bearer`
- **RBAC**: `admin` (full access) vs `reviewer` (no scan trigger; cannot set `ACCEPTED_RISK`)
- **Alert queue** page (`v_secrets_alert_queue` — needs initial / reminder)
- Light / dark theme toggle

## Quick start (local)

```bash
cd secret-soc-dashboard-python
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# .env defaults to local Postgres on localhost:5432 — adjust PG_* to match your install
python run.py
```

Open **http://localhost:5002** — you will be redirected to **/login**.

Apply dashboard users (after `schema.sql`):

```bash
psql "$DATABASE_URL" -f seed_users.sql
```

Demo accounts: `admin` / `admin123`, `reviewer` / `reviewer123`

## Local PostgreSQL setup

Create the role and database to match `.env` (defaults: user `secretscan`, db `secrets_db`):

```bash
createuser -s secretscan 2>/dev/null || true
createdb -O secretscan secrets_db
psql -U secretscan -d secrets_db -f schema.sql
psql -U secretscan -d secrets_db -f seed_users.sql
```

If your local Postgres uses a different user/password, update `PG_USER`, `PG_PASSWORD`, and `PG_DATABASE` in `.env`.

## Docker (app only)

PostgreSQL is **not** run in Docker. Start Postgres on your Mac first, then:

```bash
docker compose up --build
```

The container connects to host Postgres at `host.docker.internal:5432` using credentials from `.env`.

App: **http://localhost:5002**

Prefer running without Docker: `python run.py` (uses `PG_HOST=localhost` from `.env`).

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/findings` | List findings |
| GET | `/api/findings/stats` | Dashboard stats |
| GET | `/api/findings/trend` | Trend chart data |
| PUT | `/api/findings/{id}/status` | Update workflow status (auth; RBAC) |
| GET | `/api/findings/{id}/history` | Status change audit trail |
| GET | `/api/repositories` | List repositories + last scan status |
| POST | `/api/scan/trigger` | Start scan (`admin` only) |
| GET | `/api/scan/runs/{id}` | Poll scan run status |
| GET | `/api/alerts/queue` | Email queue (needs initial / reminder) |
| GET | `/api/alerts/summary` | Alert counts by state |
| POST | `/api/auth/login` | Login (public) |
| POST | `/api/auth/verify` | Verify JWT |

## Pages

| Path | Page |
|------|------|
| `/` | Dashboard |
| `/findings` | Findings |
| `/repositories` | Repositories |
| `/login` | Sign in |
| `/scan` | Trigger Scan (admin) |
| `/alerts` | Alert queue |

## Project layout

```
secret-soc-dashboard-python/
├── app/
│   ├── main.py           # FastAPI app + page routes
│   ├── config.py
│   ├── database.py
│   ├── routers/          # API routes
│   ├── templates/        # Jinja2 HTML
│   └── static/           # CSS & JS
├── requirements.txt
├── run.py
├── Dockerfile
└── docker-compose.yml
```

Uses the PostgreSQL schema in **`../Database/schema.sql`** (see `DATABASE_SCHEMA.md` in this folder).

**Schema highlights:** workflow status lives on `secrets.secret_status`; status updates call `set_secret_status()` and are recorded in `secret_status_history`.
