# Signal — Live CRM Notification System

**Repo:** https://github.com/DOOMSDAY1009/Live-CRM-Notifications
**Live URL:** _add here once deployed — see "Deploying to get a live URL" below_

A small CRM (companies, contacts, users, role-based assignments) with a
real-time, per-user notification system, built for the internship
assignment. Full-stack, single repo, runs locally with one command.

- **Backend:** Node.js + Express + Socket.io + SQLite (via Node's built-in `node:sqlite` module — no native compilation required)
- **Frontend:** Plain HTML/CSS/JS (no build step), served statically by Express
- **Auth:** Email/password login, JWT, used for both REST calls and the
  Socket.io handshake
- **Background job:** `node-cron`, runs every 30s, creates follow-up
  reminder notifications for assignments that haven't had one yet

---

## Quick start

Requires **Node.js 22.13+** (or 23.4+) — this is what makes `node:sqlite`
available without a build step or a startup flag. Node 24 and later is
fine. Check with `node --version`.

The server creates its SQLite tables and seeds demo data automatically the
first time it boots (both steps are safe to repeat — restarting never
duplicates data), so there's no separate migrate/seed step to run.

**macOS / Linux:**
```bash
git clone https://github.com/DOOMSDAY1009/Live-CRM-Notifications.git
cd Live-CRM-Notifications
cp .env.example .env
npm install
npm start          # creates data.db + seeds demo data on first boot, then listens on :4000
```

**Windows (PowerShell):** run each line separately — PowerShell doesn't
support `&&` as a statement separator the way bash does:
```powershell
git clone https://github.com/DOOMSDAY1009/Live-CRM-Notifications.git
cd Live-CRM-Notifications
Copy-Item .env.example .env
npm install
npm start
```

Open **http://localhost:4000** in your browser. Log in with one of the
seeded accounts (shown on the login screen too):

| Email                | Password  | Role  |
|-----------------------|-----------|-------|
| admin@example.com    | admin123  | ADMIN |
| alice@example.com    | alice123  | USER  |
| bob@example.com      | bob123    | USER  |

Only `ADMIN` can create assignments (matches the spec: *"When an admin
assigns a company/contact to a user..."*). Any logged-in user can view
companies/contacts and their own notifications.

The SQLite database is a single file, `data.db`, created by `npm run
migrate` from the plain-SQL schema in `src/schema.sql`. Delete it and
re-run `npm run migrate && npm run seed` to reset to a clean demo state.

---

## Steps to test live notifications

**Via the UI (two browser windows/profiles):**
1. Window A: log in as `admin@example.com`.
2. Window B: log in as `alice@example.com`. Note the green "live" indicator
   in the top bar — that's the Socket.io connection.
3. In Window A, open a company card (e.g. Acme Corp) → **Assign to user** →
   pick Alice → pick a role → **Assign & notify**.
4. Window B instantly shows a toast in the corner and the bell badge
   increments — no page refresh. This is the "You have been assigned to
   Acme Corp" flow from the spec.
5. Click the bell in Window B, click the notification to mark it read (or
   use **Mark all read**).
6. In Window A (as admin), click **Run background job** in the top bar.
   Any assignment older than 60 seconds that hasn't had a reminder yet gets
   one, pushed live the same way. (It also runs automatically every 30s —
   the button just avoids waiting during a demo.)

**Via the API (curl), to see the plumbing directly:**
```bash
# Log in
ADMIN_TOKEN=$(curl -s -X POST localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"admin123"}' | jq -r .token)

# Assign Acme Corp (company id 1) to Alice (user id 2) as OWNER
curl -s -X POST localhost:4000/api/assignments \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"entityType":"COMPANY","entityId":1,"userId":2,"role":"OWNER"}'

# Fetch Alice's notifications (log in as Alice first to get her token)
curl -s localhost:4000/api/notifications -H "Authorization: Bearer $ALICE_TOKEN"
```
While a client is connected to Socket.io with Alice's token, the
`notification` event fires the instant the POST above completes — before
the HTTP response for the assignment even needs to be polled.

This exact flow (login as two users, assign, watch the notification arrive
only for the assigned user, mark read, trigger the background job) was
verified end-to-end while building this project, including confirming a
second user's socket never receives another user's notification.

---

## Architecture

```
Browser (public/*)                     Server (src/*)
┌─────────────────────┐                ┌──────────────────────────────┐
│ index.html/app.js    │  REST (JWT)    │ Express routes                │
│  - login             │ ─────────────► │  /api/auth, /companies,       │
│  - companies/contacts│ ◄───────────── │  /contacts, /assignments,     │
│  - assignment modal  │                │  /notifications, /jobs         │
│  - notification bell │                │                               │
│                       │  Socket.io     │ Socket.io (JWT in handshake)  │
│                       │ ◄────────────  │  - each socket joins room     │
│                       │   'notification'  user:<id> only               │
└─────────────────────┘                │                               │
                                        │ node-cron (every 30s)          │
                                        │  - follow-up reminder job      │
                                        │                               │
                                        │ node:sqlite (data.db, built-in)│
                                        │  users / companies / contacts  │
                                        │  / assignments / notifications │
                                        └──────────────────────────────┘
```

**Data model** (`src/schema.sql`):
- `users` — id, name, email, password (bcrypt hash), role (`ADMIN`/`USER`)
- `companies` — id, name, industry
- `contacts` — id, name, email, phone, `companyId` (FK, nullable)
- `assignments` — `userId` (FK), `entityType` (`COMPANY`/`CONTACT`),
  `entityId`, `role`, `reminderSent` flag used by the background job
- `notifications` — `userId` (FK), message, `type`
  (`ASSIGNMENT`/`REMINDER`), `metadata` (JSON string), `isRead`

`assignments.entityType` + `entityId` (instead of two nullable foreign
keys) keeps the model open to future assignable entity types without a
migration — see the tradeoff note below.

**Real-time delivery:** Socket.io connections authenticate with the same
JWT used for REST calls, then join a room named `user:<id>`. `notify.js`'s
`createNotification()` is the single choke point every notification passes
through — it writes the row to SQLite *and* emits to `user:<id>` only,
which is what guarantees other users never see it (there is no broadcast
anywhere in the codebase). If the user is offline, the row is still there
next time they call `GET /api/notifications`.

**Background process:** `src/jobs/followupJob.js` is scheduled with
`node-cron` to run every 30 seconds. It looks for assignments older than
`FOLLOWUP_DELAY_MS` (default 60s, configurable in `.env`) that haven't had
a reminder yet, creates a `REMINDER` notification for the assigned user
through the same `createNotification()` path, and flags the assignment so
it won't fire twice. `POST /api/jobs/run-followup` (admin-only) runs the
exact same function on demand for demo convenience.

---

## Assumptions & tradeoffs

- **SQLite over Postgres/Mongo, via `node:sqlite` specifically.** Zero
  external setup for a reviewer — `npm run setup` and it's ready. Node's
  *built-in* `node:sqlite` module (stable without a flag since Node
  22.13/23.4) was chosen over both Prisma and `better-sqlite3`: Prisma
  downloads compiled query-engine binaries from an external CDN at install
  time, which fails in network-restricted environments, and
  `better-sqlite3` is a native addon that needs to be compiled with
  node-gyp — which fails on Windows machines without Visual Studio's C++
  build tools installed (the exact error `find VS ... could not use
  PowerShell to find Visual Studio`). `node:sqlite` ships inside the Node
  binary itself, so `npm install` never needs to touch a compiler on any
  OS. Its one downside: Node currently logs it as an
  `ExperimentalWarning` on startup — harmless, and expected to go away as
  the module stabilizes further. Swapping to Postgres would mean
  replacing `src/db.js` + `src/models.js` with a Postgres client/query
  layer; the route/socket/job code above that layer wouldn't need to
  change.
- **node-cron in-process, not a real queue.** A production system would
  more likely use a proper job queue (BullMQ + Redis, SQS, etc.) so
  background work survives server restarts and scales across instances.
  For this assignment's scope, an in-process scheduled function is
  simpler and still demonstrates the required pattern (a background
  process independently creating notifications).
- **JWT auth, no refresh tokens / password reset / signup UI.** Login only,
  against three seeded accounts. Real auth (signup, password reset,
  refresh tokens) was out of scope for what the assignment is evaluating.
- **Two roles only (`ADMIN`, `USER`).** The spec asks for "role-based
  assignments" primarily in the sense of a person's role on a given
  company/contact (Owner, Manager, Sales Rep, Support — free text on the
  assignment), separate from system permission (`ADMIN` vs `USER`, which
  only gates who can *create* assignments). A larger system would likely
  separate these more formally (e.g. a `permissions` table).
- **`entityType`/`entityId` instead of two nullable FKs on `Assignment`.**
  Keeps the model extensible (e.g. adding "Deal" as an assignable entity
  later needs no migration) at the cost of the database not enforcing
  referential integrity on that pointer — the application layer validates
  the entity exists before creating the assignment instead.
- **CORS wide open (`origin: '*'`) and JWT secret via `.env`.** Fine for a
  local/demo deployment; a real deployment would restrict CORS to the
  actual frontend origin and use a managed secret store.
- **No pagination.** Company/contact/notification lists are returned in
  full. Fine at demo scale; a production version would paginate.

---

## Project layout

```
src/
  server.js          Express + Socket.io entrypoint
  db.js              node:sqlite connection (Node's built-in SQLite driver)
  schema.sql          Plain-SQL schema (run by migrate.js)
  migrate.js          Applies schema.sql to data.db
  models.js           All data-access queries, one place per entity
  seed.js             Creates the 3 demo users + 2 companies + 2 contacts
  middleware/auth.js   JWT verification + admin guard
  sockets/index.js     Socket.io auth + per-user room join
  jobs/followupJob.js  Scheduled + on-demand background reminder job
  utils/token.js       JWT sign/verify
  utils/notify.js      Single notification-creation choke point (DB write + live push)
  routes/*.js          auth, users, companies, contacts, assignments, notifications, jobs
public/
  index.html, app.js, styles.css   Frontend (no build step)
```

## Deploying to get a live URL

Recommended host: **Render.com** — free tier, supports WebSockets (needed
for Socket.io), no credit card required for a basic web service.

1. Push this repo to GitHub if you haven't already (see commands below).
2. Go to **render.com** → sign in with GitHub → **New +** → **Web Service**.
3. Connect the `Live-CRM-Notifications` repo.
4. Settings:
   - **Environment:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free is fine for a demo.
5. Add environment variables (Render dashboard → Environment tab):
   - `JWT_SECRET` → any long random string (e.g. generate one with
     `openssl rand -hex 32` locally, or just mash the keyboard)
   - `FOLLOWUP_DELAY_MS` → `60000` (optional, this is the default)
   - Do **not** set `DATABASE_PATH` unless you've attached a persistent
     disk (see caveat below) — it'll default to a file next to the app.
6. Click **Create Web Service**. Render will install, boot the app (which
   auto-creates the SQLite tables and seeds the 3 demo users + demo
   companies on first boot), and give you a URL like
   `https://live-crm-notifications.onrender.com`.
7. Open that URL, log in with `admin@example.com` / `admin123`, and run
   through the demo flow from "Steps to test live notifications" above —
   it works identically over the internet, since Socket.io just needs
   WebSocket support, which Render provides.

**Free-tier caveats worth knowing (and worth stating to whoever reviews
this):**
- Render's free web services **spin down after inactivity** and cold-start
  on the next request (can take ~30–50s the first time someone loads it
  after it's been idle).
- Free tier has an **ephemeral filesystem** — the SQLite file resets on
  every redeploy/restart. This doesn't break anything (the server
  re-creates tables and reseeds automatically), it just means any data you
  add during one session won't survive a redeploy. For a review demo this
  is fine; for real persistence, either upgrade to a paid instance with a
  persistent disk (set `DATABASE_PATH` to a path under the mounted disk,
  e.g. `/var/data/data.db`) or move to Railway/Fly.io, both of which offer
  persistent volumes on their free/hobby tiers too.

### Pushing this project to your repo

If the code isn't in `DOOMSDAY1009/Live-CRM-Notifications` yet:
```bash
cd live-crm-notifications
git init
git add .
git commit -m "Live CRM notification system with Socket.io, background job, SQLite"
git branch -M main
git remote add origin https://github.com/DOOMSDAY1009/Live-CRM-Notifications.git
git push -u origin main
```
If the repo already has an initial commit (e.g. a README created from
GitHub's UI), pull first to avoid a conflict:
```bash
git remote add origin https://github.com/DOOMSDAY1009/Live-CRM-Notifications.git
git pull origin main --allow-unrelated-histories
git add .
git commit -m "Live CRM notification system with Socket.io, background job, SQLite"
git push -u origin main
```

Once deployed, add the live URL to the top of this README (or just paste
it in the submission form) — that closes out the one deliverable that
can't be done from inside a sandbox.
