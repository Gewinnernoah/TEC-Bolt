# TEC Hub

School technology management platform — device inventory, lending, 3D printing, support tickets, event planning, and more.

Built with React, TypeScript, Tailwind CSS, and a local PostgreSQL database.

---

## Quick Start (Windows)

### Option A: Auto-Installer (recommended)

The auto-installer checks for PostgreSQL, installs it if needed, creates the database and user, configures `.env`, installs npm packages, and applies the schema — all in one step.

```powershell
powershell -ExecutionPolicy Bypass -File .\autoinstaller.ps1
```

After it finishes:

```bash
npm run dev
```

Then open **http://localhost:5173/TEC-Bolt/** in your browser.

Log in with the default admin account:

- **Email:** `admin@techub.local`
- **Password:** `admin123`

### Option B: Manual Setup

1. **Install PostgreSQL 16+** from [postgresql.org](https://www.postgresql.org/download/windows/)

2. **Create database and user** (in pgAdmin or `psql`):
   ```sql
   CREATE USER techub_user WITH PASSWORD 'TechHub2024!';
   CREATE DATABASE techub OWNER techub_user;
   ```

3. **Configure `.env`** — the defaults are:
   ```
   VITE_DB_MODE=postgres
   PG_HOST=localhost
   PG_PORT=5432
   PG_USER=techub_user
   PG_PASSWORD=TechHub2024!
   PG_DATABASE=techub
   ```

4. **Install dependencies:**
   ```bash
   npm install
   ```

5. **Start the app:**
   ```bash
   npm run dev
   ```

   The PostgreSQL API server starts automatically alongside the web app. The schema is created on first run.

---

## Quick Start (Linux / macOS)

```bash
chmod +x autoinstaller.sh
./autoinstaller.sh
npm run dev
```

---

## How It Works

The app uses a **local PostgreSQL** database by default. When you run `npm run dev`, two things start:

1. **PostgreSQL API Server** (port 3456) — a lightweight Node.js server that connects to your local PostgreSQL and exposes a REST API.
2. **Vite Dev Server** (port 5173) — serves the web app to your browser.

The API server automatically creates all tables and seeds default data (ticket categories, lending periods, filament catalog, system settings) on first run. It also creates a default admin account.

### Alternative database modes

Set `VITE_DB_MODE` in `.env` to switch:

| Mode | Description |
|------|-------------|
| `postgres` | Local PostgreSQL server (default, recommended) |
| `supabase` | Supabase cloud database |
| `sqlite` | Browser-only offline mode (no server needed) |

---

## Features

- **Dashboard** — overview of all operations
- **Inventory** — device management with categories, rooms, cabinets, QR/barcode tracking
- **Lending** — teachers request devices, staff approve and check out with signatures
- **3D Printing** — teachers submit print requests, staff manage the print queue
- **Tickets** — technical support ticket system with categories, priorities, and Wi-Fi speedtest
- **Calendar** — event and auditorium planning
- **Analytics** — usage statistics and reports
- **Monitoring** — Wi-Fi heatmap and building monitoring
- **FAQ** — knowledge base for common questions
- **Admin** — user management, system settings, activity logs

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the web app + PostgreSQL API server |
| `npm run server` | Start only the PostgreSQL API server |
| `npm run build` | Build for production |
| `npm run typecheck` | Run TypeScript type checking |
| `npm run lint` | Run ESLint |
