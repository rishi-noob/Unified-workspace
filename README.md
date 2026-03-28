# Unified Helpdesk Ticketing Hub (MVP)

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

From `apps/api`:

```bash
pnpm run seed
```

Demo login (all accounts): password **`Demo@1234`**

| Email | Role |
|-------|------|
| admin@company.com | super_admin |
| it-manager@company.com | manager |
| it-lead@company.com | team_lead |
| it-agent1@company.com | agent |

### 3. Run API + web

From repo root `unified-ticketing`:

```bash
pnpm run dev
```

- API: [http://localhost:4000](http://localhost:4000) — Swagger: [http://localhost:4000/api/docs](http://localhost:4000/api/docs)
- Web (Vite): [http://localhost:5173](http://localhost:5173) — proxied to `/api` and `/webhooks`

### Build

```bash
pnpm run build
```

## Inbound email (Gmail / one inbox)

The API can poll an IMAP inbox (e.g. `rishabhathrit@gmail.com`) and create **email** channel tickets from **unread** messages.

1. In Google Account → Security → **App passwords**, create an app password for Mail.
2. In `apps/api/.env` set:

   - `IMAP_ENABLED=true`
   - `IMAP_USER=rishabhathrit@gmail.com`
   - `IMAP_PASSWORD=<16-char app password>`
   - `IMAP_HOST=imap.gmail.com` / `IMAP_PORT=993` (defaults are fine)

3. Restart the API. Poll interval: `IMAP_POLL_INTERVAL_MS` (default 60000).

**Routing one inbox to IT / HR / Travel** (seed creates all three departments):

| Method | Example |
|--------|---------|
| **Gmail plus-address** | Send to `rishabhathrit+it@gmail.com`, `rishabhathrit+hr@gmail.com`, `rishabhathrit+travel@gmail.com` (all deliver to the same mailbox; the `+tag` picks the department). |
| **Subject tag** | Subject starts with `[IT]`, `[HR]`, or `[TRAVEL]` (e.g. `[HR] Leave question`). |
| **Department alias** | `To:` matches a department `emailAlias` from the DB (e.g. helpdesk-hr@company.com if you use that address). |

If none match, the ticket is created **without** a department; **Gemini/keyword AI** classification then assigns IT / HR / Travel when confident.

## Notes

- **Docker / Postgres / Redis** are not required for this MVP; you can add them later for production.
- **Freshdesk webhooks**: HMAC uses `JSON.stringify(payload)`; for production, verify against the **raw request body** (same bytes Freshdesk signed).
