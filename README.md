# Unified Helpdesk Ticketing Hub (MVP)

**Full product documentation:** [docs/PRODUCT_DOCUMENTATION.md](docs/PRODUCT_DOCUMENTATION.md) (architecture, roles, channels, env, operations).

Local-first setup: **SQLite** via TypeORM **`sqljs`** (pure JS/WASM — no native DB or bcrypt binaries), **NestJS** API, **React + Vite** web app, **Google Gemini** for classification and reply drafts (optional — keyword rules work without an API key). Passwords use **bcryptjs**.

## Prerequisites

- Node.js 18+
- [pnpm](https://pnpm.io/) (`npm install -g pnpm`)

## Quick start

```bash
cd unified-ticketing
pnpm install
```

### 1. API environment

```bash
cd apps/api
copy .env.example .env
```

Edit `apps/api/.env`:

- `JWT_SECRET` — at least 32 characters.
- `GEMINI_API_KEY` — optional; if unset or invalid, classification uses keyword rules only.

Database file is created automatically at `apps/api/ticketing.db` (TypeORM `synchronize: true` for local dev).

### 2. Seed demo users & departments

From the repo root **or** from `apps/api`:

```bash
pnpm run seed
```

(At the root this runs `pnpm --filter api run seed`.)

Demo login (all accounts): password **`Demo@1234`**

| Email | Role | Notes |
|-------|------|--------|
| admin@company.com | super_admin | Full admin |
| it-manager@company.com | manager | IT |
| hr-manager@company.com | manager | HR |
| it-lead@company.com | team_lead | IT |
| hr-lead@company.com | team_lead | HR |
| it-agent1@company.com / it-agent2@company.com | agent | IT queue |
| hr-agent1@company.com / hr-agent2@company.com | agent | HR queue (payroll, leave, policies, etc.) |
| travel@company.com | agent | Travel queue |
| multilead@company.com | team_lead | IT + Travel (demo) |

Re-run **`pnpm run seed`** after pulling changes so new users (e.g. HR lead / second HR agent) exist in your DB.

### Excel bulk import

Use **Excel Upload** in the web app (team_lead+). **First sheet only**; **row 1** = headers, then one ticket per row.

| Column | Values |
|--------|--------|
| `subject` | 1–255 characters |
| `description` | Required text |
| `department` | Slug: **`it`**, **`hr`**, or **`travel`** (must match a department in the DB) |
| `priority` | **`low`**, **`normal`**, **`high`**, **`critical`** |
| `requester_email` | Valid email |

A sample file ships with the web app: `apps/web/public/ticketing-bulk-import-template.csv` (also linked on the upload page).

### 3. Run API + web

From repo root `unified-ticketing`:

```bash
pnpm run dev
```

- API: [http://localhost:4000](http://localhost:4000) — Swagger: [http://localhost:4000/api/docs](http://localhost:4000/api/docs)
- Web (Vite): [http://localhost:5173](http://localhost:5173) — proxied to `/api` and `/webhooks`

**Vite `ws proxy error` / `ECONNREFUSED`:** the web app proxies **Socket.IO** to port **4000**. If the API is not up yet, you may see this until Nest is listening. Prefer **`pnpm run dev`** (starts both) or run **`pnpm run dev:api`** before opening the browser. Benign `ECONNREFUSED` logs for `/socket.io` are suppressed in `vite.config.ts` when the target is simply down.

### Build

```bash
pnpm run build
```

## Inbound email — one address for everything

Configure **one** mailbox (e.g. `rishabhathrit@gmail.com`). **All** customer mail lands there. The app does **not** require separate addresses per team.

1. Google Account → Security → **App passwords** → create a password for Mail (with 2FA).
2. In `apps/api/.env`:

   - `IMAP_ENABLED=true`
   - `IMAP_USER=rishabhathrit@gmail.com`
   - `IMAP_PASSWORD=<app password>`
   - `IMAP_HOST=imap.gmail.com` / `IMAP_PORT=993`

3. Restart the API. Poll interval: `IMAP_POLL_INTERVAL_MS` (code default **25000** ms ≈ 25s). If a poll runs long, the next tick is **queued** so cycles are not skipped.

**Read mail in Gmail?** Older builds only ingested **unread** messages, so opening a new email in Gmail (marking it read) could skip it. The API keeps **`apps/api/mail-ingest-uid.state.json`** (next to `ticketing.db`, not dependent on shell `cwd`) so **new messages still ingest after you read them**. If a message never becomes a ticket but Gmail shows it in **Inbox**, stop the API, **delete that JSON file** (and any duplicate `mail-ingest-uid.state.json` in the monorepo root from older runs), restart, and send again — the next poll will re-establish a safe UID baseline.

**Only new mail (default):** Ingest uses the UID cursor plus **new UIDs only** — it does **not** sweep old **UNSEEN** newsletters in bulk (that used to create random tickets). It also checks **UNSEEN in the last ~300 UIDs** so very recent unread messages are less likely to be missed. To ticket legacy unread backlog, set **`IMAP_INCLUDE_UNSEEN_BACKLOG=true`** once (then turn off). New mail is still ingested even if you already opened it in Gmail (UID range). **Newest first** + **`IMAP_MAX_MESSAGES_PER_POLL`** caps work per poll when backlog mode is on.

**Roles:** **`team_lead`** users see **department-scoped** analytics only (their `departmentIds` in the DB). **`manager`** / **`super_admin`** see organization-wide metrics on the manager dashboard. The home dashboard title reflects the role (e.g. **Team lead dashboard** vs **My dashboard**).

**What happens to each email**

1. A **ticket** is created (channel `email`).
2. **Keywords + Gemini** (if configured) decide **IT**, **HR**, or **Travel** from the subject/body.
3. **SLA** is applied for that department.
4. The ticket is **auto-assigned** to an **agent** in that department who currently has the **fewest open tickets** (load balancing).  
   **HR** mail (e.g. *paycheck*, *payroll*, *leave*, *policy*) routes to the **HR** department and agents such as `hr-agent1@company.com` / `hr-agent2@company.com` when those users exist in the seed.

**Optional** (only if you want to force a department before AI): subject prefix `[IT]` / `[HR]` / `[TRAVEL]`, or Gmail plus-addressing `rishabhathrit+it@gmail.com` (same inbox).

## Gemini 429 / quota

If logs show **`429 Too Many Requests`** or **`quota exceeded`**, Google’s free tier for that model is exhausted or disabled for your project. The app then falls back to **keyword routing** (IT / HR / Travel) — tickets still work. To stop classify API calls entirely, set in `apps/api/.env`:

`GEMINI_CLASSIFY_ENABLED=false`

You can also try another model via `GEMINI_MODEL_CLASSIFY` (see [Google AI rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)).

**Inbound mail:** `IMAP_INGEST_SKIP_BULK=true` (default) skips obvious **noreply / bulk / auto-submitted** messages so random newsletters become fewer tickets. Set `IMAP_INGEST_SKIP_BULK=false` if something legitimate is skipped.

**Auto-ack** uses **Reply-To** when present, otherwise **From** — so transactional providers (e.g. Twilio) should set **Reply-To** to the customer’s email, or the acknowledgement goes to the provider address.

## Notes

- **Docker / Postgres / Redis** are not required for this MVP; you can add them later for production.
- **Freshdesk webhooks**: HMAC uses `JSON.stringify(payload)`; for production, verify against the **raw request body** (same bytes Freshdesk signed).
