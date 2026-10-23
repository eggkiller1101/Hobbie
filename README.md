# ⏱️ Hobbies Time Tracker

Track the time people spend on their hobbies. Tell Tracky the quokka (the island guide) your name the first time (after that, just pick it from the list). A loading page shows **today's weather**, and the island's sky matches it: sun, clouds, rain, snow, fog, storms, day or night. Then pick (or add) a hobby, press **Start**, and watch the timer run. **Pause** or **Stop** at any time; Stop saves the session and finishes with a celebration screen.

The look is a cozy island theme inspired by Animal Crossing: sky and clouds, cream panels, rounded type and bouncy motion. All artwork is original CSS/SVG, with no Nintendo assets.

> **Status: v0.4.** Everything works end to end: players, hobbies and sessions are saved in the database (**Supabase** or a local **SQLite** file), the timer counts real time, and the Hobby Log shows real totals.

---

## Browser privacy (no login)

Each browser gets a random identity in an HttpOnly cookie. IP addresses are not
used to identify people. The server stores only a SHA-256 hash of the cookie
credential and filters every player, custom hobby and time query by that hash.
A browser may keep multiple player profiles; those profiles share that browser's
Hobby Log. Separate browsers cannot read or save each other's records, even
when their players use the same name. The four starter hobbies are shared.

Keep cookies to return to your records. Clearing cookies, using a private window,
changing browser/device, or moving to another hostname starts a new identity.
There is no automatic recovery or cross-device sync. Anyone using the same
browser profile can access its records.

Legacy shared records remain in `entrants`, `hobbies`, `time_entries` and
`hobby_totals`; the application no longer reads them. New records use
`browser_entrants`, `browser_hobbies`, `browser_time_entries` and
`browser_hobby_totals`. Legacy data is not automatically claimed by the first
visitor. An administrator must explicitly migrate it to a verified identity.

API responses use `Cache-Control: private, no-store`. The browser cookie is
host-only, HttpOnly and SameSite=Lax; HTTPS deployments also use Secure and the
`__Host-` prefix. Writes require a cookie established by an initial GET request.

## Tech stack

| Layer     | Technology                                      | Why                                                |
|-----------|-------------------------------------------------|----------------------------------------------------|
| Front end | Plain HTML, CSS, JavaScript (no framework)      | Nothing to compile. Edit and refresh the browser.  |
| Fonts     | [Fredoka](https://fonts.google.com/specimen/Fredoka) and [Nunito](https://fonts.google.com/specimen/Nunito) from Google Fonts | Rounded, friendly type. Needs internet; offline it falls back to system fonts. |
| Back end  | [Node.js](https://nodejs.org) 22+ with [Express 5](https://expressjs.com) | Small, popular web server for JSON APIs. |
| Database  | [Supabase](https://supabase.com) (hosted PostgreSQL) via [supabase-js](https://supabase.com/docs/reference/javascript), **or** [SQLite](https://sqlite.org) via [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) | Supabase when it's set up in `.env`; otherwise a local file with nothing to install. |
| Weather   | [Open-Meteo](https://open-meteo.com) | Free, and no account or API key needed. Called from the browser. |

---

## Project structure

```
hobbie-time-tracker/
├── package.json            ← project metadata, dependencies, npm scripts
├── .npmrc                  ← npm settings: skip dependency install scripts (see Troubleshooting)
├── .env.example            ← template for .env (your Supabase settings; .env itself is git-ignored)
├── data/                   ← the SQLite file is created here when Supabase isn't set up (git-ignored)
├── supabase/
│   └── migrations/         ← SQL that creates the tables and view in Supabase (run in order)
├── server.js               ← entry point: starts Express; auto-detected by Vercel
├── server/                 ← BACK END (runs in Node.js)
│   ├── env.js              ← loads .env (imported first)
│   ├── validation.js       ← shared input checks (names, ids, dates) and HttpError
│   ├── db/
│   │   ├── index.js        ← picks the database: Supabase if configured, else SQLite
│   │   ├── supabase-store.js ← talks to Supabase over HTTPS
│   │   ├── sqlite-store.js ← talks to the local SQLite file
│   │   ├── schema.sql      ← legacy shared SQLite schema (retained for migration tests)
│   │   └── browser-schema.sql ← current browser-owned SQLite tables and view
│   └── routes/
│       ├── entrants.js     ← /api/entrants
│       ├── hobbies.js      ← /api/hobbies (also /api/hobbie)
│       └── time.js         ← /api/time
└── public/                 ← FRONT END (runs in the browser)
    ├── index.html          ← page layout
    ├── css/styles.css      ← styling, including the weather scenes
    └── js/
        ├── app.js          ← screens, player list, hobbies, timer, Hobby Log
        └── weather.js      ← today's weather: location, Open-Meteo, weather codes
```

**How a request flows:** the browser calls `fetch('/api/time', …)` → Express sends it to `server/routes/time.js` → the route checks the input and calls the **store** → the store writes to Supabase (or SQLite) → JSON goes back → `app.js` updates the page.

The routes never know which database they're using: both stores offer the same functions (`listEntrants`, `findOrCreateHobby`, `createTimeEntry`, `hobbyTotals`, …). That's why switching databases is just a setting.

---

## Run it locally

### 1. Prerequisites (one-time)

- **Node.js 22 or newer** (the LTS version is recommended). Check what you have:
  ```bash
  node --version
  ```
  If the command isn't found or shows a version below `v22`, download the LTS installer from <https://nodejs.org>. npm comes bundled with it.
- **Git**, to clone the repository: <https://git-scm.com/downloads>

### 2. Get the code

```bash
git clone https://github.com/eggkiller1101/Hobbie.git
cd Hobbie
```

### 3. Install dependencies

```bash
npm install
```

This downloads Express, supabase-js and better-sqlite3 into a `node_modules/` folder. Run it again whenever `package.json` changes.

### 4. Choose the database

- **Supabase:** follow [Supabase setup](#supabase-setup) below (run all three SQL files, then fill in `.env`).
- **Local SQLite:** do nothing. Without a `.env` file the app uses `data/hobbies.db`.

### 5. Start the server

```bash
npm run dev
```

You should see one of:

```
Hobbies Time Tracker running at http://localhost:3000
Database: Supabase (https://your-project.supabase.co)
```
```
Hobbies Time Tracker running at http://localhost:3000
Database: SQLite (.../hobbie-time-tracker/data/hobbies.db)
```

Then open <http://localhost:3000/api/health>. It should say `"status":"ok"`; if not, it says what's wrong.

### 6. Open the app

Go to **<http://localhost:3000>** in your browser.

1. **Tracky** the quokka greets you.
   - **First time:** type your name and press **Enter** (or click **That's me!**). Tracky remembers it.
   - **After that:** click your name in the list. New people click **+ I'm new here**.
2. A leafy circle wipe opens the **loading page** with today's weather. The first time, your browser asks to use your location: **Allow** gives your local weather, **Block** uses the fallback city (see [Weather](#weather)).
3. After a few seconds (or click **Let's go!**) the tracker opens, with the sky matching the weather.
4. **Pick a hobby** (or type a new one and click **Add**), then press **Start**. The hobby hops on the island while the timer runs.
5. **Pause** stops the clock (paused time isn't counted); **Resume** carries on.
6. **Stop** saves the session and shows your total for that hobby. The **Hobby Log** updates, with your rows highlighted.

While a session is running, the hobby picker and **Switch player** are locked, so a session can't be lost by accident. Closing the tab mid-session asks you to confirm first.

### 7. Stop the server

Press **Ctrl + C** in the terminal.

---

## Supabase setup

### 1. Create the tables and view (once)

Run all three files in `supabase/migrations/` **in order** (the date in the filename is the order):

| File | Creates |
|---|---|
| `20261022061940_create_hobby_tracker_tables.sql` | the three tables, constraints, indexes, Row Level Security |
| `20261022064247_add_totals_view_access_and_starter_hobbies.sql` | the legacy `hobby_totals` view and starter hobbies |
| `20261023125937_browser_identity_isolation.sql` | isolated browser-owned tables, summary view, server grants and starter hobbies |

For each file:

1. Open your project in the [Supabase dashboard](https://supabase.com/dashboard).
2. In the left sidebar, open **SQL Editor** and click **New query**.
3. Open the file in VS Code, select all (**Ctrl + A**), copy, and paste it into the editor.
4. Click **Run** (or **Ctrl + Enter**). You should see *Success. No rows returned*.

All three files are safe to run again (`IF NOT EXISTS`, `CREATE OR REPLACE`). If you already ran the first two, run the browser isolation migration next.

**Alternative (Supabase CLI):** `npx supabase login`, `npx supabase init` (once; it keeps the existing `migrations` folder), `npx supabase link --project-ref <your-project-ref>`, then `npx supabase db push`.

### 2. Point the server at your project

1. Copy the template:
   ```powershell
   Copy-Item .env.example .env     # Windows PowerShell   (macOS/Linux: cp .env.example .env)
   ```
2. Open `.env` in VS Code and fill in the two values. Supabase moves its menus around occasionally, so look for these:
   - `SUPABASE_URL`: your project URL, like `https://abcdefghijklmnop.supabase.co` (**Project Settings → Data API**, or the **Connect** button).
   - `SUPABASE_SECRET_KEY`: the **secret** key, starting `sb_secret_` (**Project Settings → API Keys**). The legacy **service_role** key also works.
3. Restart the server (`Ctrl + C`, then `npm run dev`). It should print `Database: Supabase (…)`.

> ⚠️ **Use the secret key, not the publishable/anon key.** The tables have Row Level Security on, so the public key can't see anything. The server checks for this and stops with a clear message if you paste the wrong one.
>
> 🔒 The secret key can read and change everything, so it only ever lives on the server, in `.env`, which is git-ignored. The browser never sees it; it only talks to our own API.

### Why HTTPS (supabase-js) and not a direct database connection?

Supabase's web API runs over normal HTTPS (port 443), which office networks allow. Direct PostgreSQL connections use ports 5432/6543, which corporate firewalls often block.

### How the PostgreSQL schema differs from SQLite

| SQLite (`server/db/schema.sql`) | PostgreSQL (Supabase migrations) |
|---|---|
| `INTEGER PRIMARY KEY AUTOINCREMENT` | `bigint generated by default as identity` |
| Dates as `TEXT` | `timestamptz` (a real date-time type, stored in UTC) |
| `UNIQUE COLLATE NOCASE` | a unique index on `lower(name)`, since Postgres has no NOCASE |
| Foreign keys only checked when switched on | Always checked; the indexes on them are created explicitly |
| Validation only in the API | `CHECK` constraints too: name length, no spaces at the ends, duration ≥ 0, end after start |
| A plain view | A view with `security_invoker = true`, so it respects Row Level Security |

### Security: Row Level Security (RLS)

Supabase publishes every table in the `public` schema through its web API, so anyone holding the project's public key could otherwise read or change the data. The migrations turn **RLS on with no policies**, which blocks that route completely, and the `browser_hobby_totals` view uses `security_invoker` so it can't be used to slip past RLS. The server's secret key bypasses RLS; it stays server-side, and every application query is scoped using the browser credential hash.

Supabase's Advisors may show an info notice *"RLS Enabled No Policy"*. That's expected: the tables are locked on purpose.

---

## npm scripts

| Command         | What it does                                                                 |
|-----------------|------------------------------------------------------------------------------|
| `npm run dev`   | Starts the server and **restarts it automatically** when you save `server.js` or an imported file in `server/`. Use this while developing. (Changes to `.env` need a manual restart.) |
| `npm start`     | Starts the server once, with no auto-restart.                                |

Changes to files in `public/` (HTML, CSS, JS) don't need a restart. Just refresh the browser.

**Use a different port** if 3000 is busy: set `PORT=3001` in `.env`, or:

```powershell
$env:PORT=3001; npm run dev    # Windows PowerShell   (macOS/Linux: PORT=3001 npm run dev)
```

---

## API

| Method | Endpoint         | Purpose                                          | Body (JSON) |
|--------|------------------|--------------------------------------------------|-------------|
| GET    | `/api/health`    | Which database, and is it reachable and set up?  | – |
| GET    | `/api/entrants`  | List this browser’s players                               | – |
| POST   | `/api/entrants`  | Add a player (or get the existing one)           | `{ "name": "Alex" }` |
| GET    | `/api/hobbies`   | List starter and this browser’s hobbies           | – |
| POST   | `/api/hobbies`   | Add a hobby (or get the existing one)            | `{ "name": "Fishing" }` |
| GET    | `/api/time`      | This browser’s totals (the Hobby Log)  | – |
| POST   | `/api/time`      | Save a finished session                          | see below |

`/api/hobbie` (the name in the original spec) works too: it's the same as `/api/hobbies`.

**Players and hobbies** are returned as `{ "id", "name", "created_at" }`:

- **201 Created:** a new one was saved.
- **200 OK:** that name already exists within this browser (matching ignores upper/lower case), so you get the existing one back, not a duplicate.
- **400 Bad Request:** the name is empty, or too long (players 20 characters, hobbies 40).

**Saving a session** (`POST /api/time`):

```json
{
  "entrant_id": 1,
  "hobby_id": 2,
  "started_at": "2026-10-22T09:00:00.000Z",
  "ended_at": "2026-10-22T09:45:00.000Z",
  "duration_seconds": 2400
}
```

`duration_seconds` is **active** time (pauses excluded), so it must be at least 1 and no more than the time between `started_at` and `ended_at`. `ended_at` can't be in the future. Unknown ids give `400 Unknown player or hobby.` On success you get `201` and the saved row.

**Totals** (`GET /api/time`) come from the `browser_hobby_totals` view, filtered by browser, biggest first:

```json
[{ "entrant_id": 1, "entrant": "Alex", "hobby_id": 2, "hobby": "Painting", "sessions": 3, "total_seconds": 5400 }]
```

### Try the API from the terminal (while the server is running)

**Windows PowerShell:**
```powershell
Invoke-RestMethod -SessionVariable browser http://localhost:3000/api/entrants
Invoke-RestMethod -WebSession $browser http://localhost:3000/api/hobbies
Invoke-RestMethod -WebSession $browser -Method Post -Uri http://localhost:3000/api/entrants -ContentType 'application/json' -Body '{"name":"Alex"}'
Invoke-RestMethod -WebSession $browser http://localhost:3000/api/time
```

**macOS / Linux / Git Bash:**
```bash
curl -c cookies.txt http://localhost:3000/api/entrants
curl -b cookies.txt -X POST http://localhost:3000/api/entrants -H "Content-Type: application/json" -d '{"name":"Alex"}'
```

You can also paste any `GET` URL straight into the browser.

---

## Database

### Data model

```
browser_entrants (1) ──< browser_time_entries >── (1) browser_hobbies
```

| Table / view   | Key columns                                                                 |
|----------------|-----------------------------------------------------------------------------|
| `browser_entrants` | `id`, `browser_key`, `name` (unique within browser, ignoring case), `created_at`                          |
| `browser_hobbies` | `id`, `browser_key`, `name` (unique within browser, ignoring case), `created_at`                          |
| `browser_time_entries` | `id`, `browser_key`, `entrant_id` → browser_entrants, `hobby_id` → browser_hobbies, `started_at`, `ended_at`, `duration_seconds` (active time, pauses excluded) |
| `browser_hobby_totals` (view) | `browser_key`, `entrant_id`, `entrant`, `hobby_id`, `hobby`, `sessions`, `total_seconds` |

Timestamps are stored in **UTC**. Convert to local time when displaying.

### Local SQLite file (when Supabase isn't set up)

- `data/hobbies.db` is **created automatically** the first time the server starts, with four starter hobbies.
- `server/db/browser-schema.sql` runs on every start. `IF NOT EXISTS` means existing data is never touched; an older database gains separate browser-owned tables without deleting its legacy records.
- `hobbies.db-wal` and `hobbies.db-shm` next to it are normal SQLite working files (WAL mode), so leave them alone.
- **To reset it**, stop the server, delete the three `data/hobbies.db*` files, and start it again.
- **To browse it**, open `data/hobbies.db` in [DB Browser for SQLite](https://sqlitebrowser.org) (free) or a VS Code SQLite extension.

Data does **not** move between SQLite and Supabase automatically: each keeps its own players and sessions.

---

## Weather

- **Where it comes from:** [Open-Meteo](https://open-meteo.com), free with no key. `public/js/weather.js` calls it straight from the browser. The browser already knows how to get through office proxies and certificates, and there's no secret key to protect.
- **Location:** the browser asks permission once. Your position is rounded to about 1 km before it's sent, which is plenty for weather.
- **Fallback city:** if location is blocked or unavailable, the app shows the weather for **Sydney**. To change it, edit `FALLBACK_LOCATION` at the top of `public/js/weather.js` (find your coordinates by searching your city on open-meteo.com), then refresh the browser.
- **Scenes:** clear, partly cloudy, cloudy, fog, rain, storm and snow, each by day or night. "Night" uses that location's sunrise and sunset. If the weather can't be loaded, the app says so and picks day or night from your computer's clock.
- Results are reused for 10 minutes, so switching players doesn't re-check the weather each time.

---

## Troubleshooting

**First stop: <http://localhost:3000/api/health>.** It names the database in use and, if something's wrong, what to fix.

| Problem | Fix |
|---|---|
| Server stops with **"Database setup problem: … is the PUBLIC key"** | You pasted the publishable/anon key. Put the **secret** key in `SUPABASE_SECRET_KEY` (see [Supabase setup](#supabase-setup)). |
| Server stops with **"Set both SUPABASE_URL and SUPABASE_SECRET_KEY"** | Only one of the two is filled in `.env`. Fill both, or empty both to use SQLite. |
| Health says **"A table or view is missing in Supabase"** | Run all three SQL files in `supabase/migrations`, in order. |
| Health says **"Supabase rejected the API key"** | The key in `.env` is wrong or was regenerated. Copy it again from the dashboard and restart the server. |
| Health says **"Can't reach Supabase"** | Check `SUPABASE_URL` (it starts with `https://` and ends with `.supabase.co`) and your internet connection. Paused free projects also need resuming in the dashboard. |
| Server still says `Database: SQLite` after editing `.env` | Restart the server: `.env` is only read at start-up. Check the file is called exactly `.env` (not `.env.txt`) and sits next to `package.json`. |
| `Port 3000 is already in use` | Another copy of the server is still running. Close that terminal or press Ctrl + C in it, or use a different `PORT` (see above). |
| `git clone` says `destination path 'hobbie-time-tracker' already exists` | A folder with that name is already there (e.g. an unzipped copy). Run `git -C hobbie-time-tracker status`. If it says *not a git repository*, delete or rename that folder and clone again. If it is a clone, `cd` into it and run `git pull` instead. |
| `npm install` fails with `node-gyp rebuild` / `gyp ERR! find VS` (better-sqlite3) | better-sqlite3 already ships ready-made binaries, but npm 10/11 wrongly tries to compile it when installing from `package-lock.json`. The project's `.npmrc` (`ignore-scripts=true`) prevents this. Make sure `.npmrc` exists (it starts with a dot, so it may be hidden in Explorer), delete `node_modules`, and run `npm install` again. You do **not** need Visual Studio. |
| `npm` / `node` not recognised (Windows) | Close and reopen the terminal after installing Node so it picks up the new PATH. |
| Tracky says **"I can't reach the island server"** | The server isn't running, or you opened the `index.html` file directly from disk. Start it with `npm run dev` and open `http://localhost:3000`. |
| Tracky says **"Something went wrong on the server"** | Look at the terminal running the server: the real reason is printed there (and at `/api/health`). If it happened on **Stop**, your time is kept: fix the problem and press Stop again. |
| Text looks plain instead of rounded | The Google Fonts couldn't load (no internet or blocked by a firewall). The app still works with system fonts. |
| Loading page says **Weather unavailable** | The browser couldn't reach `api.open-meteo.com` (no internet, or a work firewall blocks it). The app still works; the sky follows your clock instead. Press F12 → **Console** to see the exact error. |
| Weather shows the fallback city instead of where you are | Location was blocked. In Chrome/Edge, click the icon left of the address bar → **Location** → **Allow**, then reload. On Windows, also check **Settings → Privacy & security → Location**. |
| Want to remove players, hobbies or sessions | Supabase: an administrator can delete the relevant browser-owned sessions first, then players or custom hobbies in **Table Editor**. SQLite: reset the database (see [Database](#database)). |
| Changes to the page don't show | Hard refresh: **Ctrl + Shift + R** (Windows) / **Cmd + Shift + R** (macOS). |

---

## Roadmap

- [x] Welcome screen: enter your name, then a smooth transition into the tracker
- [x] Cozy island theme (Animal Crossing-inspired)
- [x] Remember players in the database; returning players pick their name
- [x] Loading page with today's weather; weather-reactive backgrounds (day and night)
- [x] Supabase (PostgreSQL) schema, with Row Level Security
- [x] All API routes real, on Supabase or SQLite
- [x] Working timer: start / pause / resume / stop, saved to `time_entries`
- [x] Accumulated time per player per hobby (Hobby Log and the finish screen)
- [ ] Encouraging messages from Tracky during long sessions
- [ ] More hobby animations

- [x] Deploy to Vercel with Supabase for persistent storage
- [x] Isolate profiles and records by browser without login

The root `server.js` is the Express entry point for Vercel. Vercel serves
`public/` through its CDN; locally, Express serves the same files. Before
deploying, configure `SUPABASE_URL` and `SUPABASE_SECRET_KEY` in the Vercel
project environment variables and run the database migrations. The local
SQLite fallback is for local development, not persistent storage on Vercel.

**Out of scope:** payments.

## Verification

Run `npm test` for two-browser read/write isolation, same-name profiles, cookie
reset and persistence, cross-origin write rejection, and legacy data preservation.
