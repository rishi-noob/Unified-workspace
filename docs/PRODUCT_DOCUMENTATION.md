# Unified Helpdesk Ticketing Hub — Product Documentation

**Version:** MVP (local-first)  
**Stack:** NestJS API · React (Vite) web · TypeORM + SQLite (sql.js) · Socket.IO · optional Google Gemini

This document describes the product as built: goals, architecture, roles, channels, configuration, and operations.

---

## 1. Product overview

### 1.1 Purpose

A **single helpdesk hub** where requests arrive through **email**, **Excel bulk upload**, **manual web tickets**, and (stub) **Freshdesk webhooks**. Tickets are **routed to IT, HR, or Travel**, get **SLA deadlines**, and are **auto-assigned** to the least-loaded agent in that department. Optional **Gemini** assists with **classification** and **reply drafts**; **keyword rules** keep the system working without AI.

### 1.2 Design principles

- **One shared mailbox** for inbound email (plus-addressing or subject tags optional).
- **Department-scoped** visibility for agents and team leads; **managers** see org-wide analytics.
- **Real-time-ish UI** via Socket.IO events when the API emits ticket lifecycle updates.
- **No Docker/Postgres required** for local MVP (SQLite in-process).

---

## 2. Architecture

### 2.1 Monorepo layout

| Path | Description |
|------|-------------|
| `apps/api` | NestJS REST API + WebSocket gateway + IMAP poller + jobs |
| `apps/web` | React SPA (Ant Design), proxies `/api`, `/webhooks`, `/socket.io` to port 4000 |
| `package.json` (root) | `pnpm run dev`, `pnpm run seed`, `pnpm run build` |

### 2.2 Runtime ports

| Service | Default URL |
|---------|-------------|
| API | `http://localhost:4000` |
| Swagger | `http://localhost:4000/api/docs` |
| Web (Vite) | `http://localhost:5173` |

### 2.3 Data store

- **SQLite** via **TypeORM `sqljs`** (WASM); database file **`apps/api/ticketing.db`** (created on first run with `synchronize: true` in dev).
- **User `departmentIds`**: JSON array of UUID strings stored as text on the `users` table.

### 2.4 Major API modules

| Module | Responsibility |
|--------|------------------|
| `AuthModule` | JWT access + refresh, login, guards |
| `UsersModule` | User CRUD (admin) |
| `DepartmentsModule` | Departments (IT, HR, Travel) |
| `TicketsModule` | Tickets, replies, notes, assignments, Socket.IO `/tickets` namespace |
| `AiModule` | Classification + reply drafts (Gemini + keywords) |
| `SlaModule` | SLA policies + scheduled breach / stale escalation |
| `AuditModule` | Audit log entries |
| `AnalyticsModule` | Overview, volume, SLA, channels, agent stats (RBAC-scoped) |
| `ChannelsModule` | Excel upload, Freshdesk hooks, **MailIngestService** (IMAP) |
| `NotificationsModule` | SMTP auto-ack + placeholders for other notifications |

### 2.5 Real-time (Socket.IO)

- Namespace: **`/tickets`**
- Client authenticates with JWT (`auth.token`).
- Server joins rooms: `agent:{userId}`, `dept:{departmentId}`, optional `ticket:{ticketId}`.
- Events emitted by backend include **`ticket:created`**, **`ticket:updated`**, **`ticket:assigned`**, **`ai:insights-ready`** (when wired from mail/AI paths).

### 2.6 Vite dev proxy

- **`/api`** → `http://localhost:4000`
- **`/socket.io`** → same, **WebSocket upgrade**
- If the **API is not listening**, the browser (or HMR) may still try WebSockets → **`ECONNREFUSED`** in the terminal until the API starts. Start **`pnpm run dev`** (both apps) or **`pnpm run dev:api`** before relying on live updates.

---

## 3. Roles and access control

### 3.1 Role hierarchy

`agent` < `team_lead` < `manager` < `super_admin`

### 3.2 Capabilities (summary)

| Capability | agent | team_lead | manager | super_admin |
|------------|-------|-----------|---------|---------------|
| Dashboard / ticket list / detail | ✓ (scoped) | ✓ (scoped) | Manager dashboard | Admin dashboard |
| Create ticket (web) | ✓ | ✓ | ✓ | ✓ |
| Reply, notes, status (within access) | ✓ | ✓ | ✓ | ✓ |
| Assign ticket | | ✓ | ✓ | ✓ |
| Excel upload | | ✓ | ✓ | ✓ |
| Analytics | | ✓ (dept-scoped) | ✓ (org-wide) | ✓ (org-wide) |
| Admin: users / departments / SLA | | | | ✓ |
| Soft-delete ticket | | | | ✓ |

### 3.3 Ticket visibility (API)

- **super_admin / manager:** all tickets.
- **team_lead:** tickets whose `departmentId` is in the lead’s `departmentIds`.
- **agent:** assigned to them, created by them, or in their department queue.

### 3.4 Analytics scoping

- **team_lead:** metrics restricted to their **`departmentIds`**; optional `?dept=` must be one of those IDs.
- **manager / super_admin:** organization-wide unless `?dept=` filters.

---

## 4. Channels and workflows

### 4.1 Email (IMAP)

1. Poller reads **first mailbox** (`IMAP_MAILBOX`, default `INBOX`).
2. **UID cursor** file (`apps/api/mail-ingest-uid.state.json`) tracks last processed UID so **read mail in Gmail** can still ingest.
3. **Poll interval** configurable (`IMAP_POLL_INTERVAL_MS`, default ~25s); overlapping polls are **queued** so ticks are not dropped.
4. Optional **`IMAP_INGEST_SKIP_BULK`:** skips noreply / bulk / auto-submitted patterns to reduce junk tickets.
5. **Message-ID** deduplication → same message does not create two tickets.
6. **Department pre-routing** (optional): `+it` / `+hr` / `+travel` in recipient, or subject prefix `[IT]` / `[HR]` / `[TRAVEL]`, or `emailAlias` match.
7. **Ticket** created → **classify** (keywords, then optional Gemini) → **SLA** from policy → **auto-assign** least busy agent in department.
8. **Auto-ack** SMTP: **`Reply-To`** preferred, else **`From`**; skipped if recipient is the helpdesk mailbox or SMTP not configured.

### 4.2 Excel

- **POST** `multipart/form-data` to `/api/v1/channels/excel/upload` (team_lead+).
- **First sheet** only; required columns: `subject`, `description`, `department` (slug `it` | `hr` | `travel`), `priority`, `requester_email`.
- Sample: `apps/web/public/ticketing-bulk-import-template.csv`.
- Each valid row creates a ticket (channel `excel`) and triggers classification.

### 4.3 Manual (web)

- Authenticated user creates ticket via API; optional AI classification.

### 4.4 Freshdesk

- Webhook/controller present for integration testing; production should verify **raw body** HMAC if required.

---

## 5. AI (Gemini + keywords)

### 5.1 Classification

- **Order:** keyword rules on subject+body → optional **Gemini** (if `GEMINI_CLASSIFY_ENABLED !== false` and key valid and circuit not open) → fallback **Other**.
- **Department assignment** only when confidence ≥ **0.8** and category is IT / HR / Travel (resolved by name or slug).
- **429 / quota:** circuit opens; keywords continue to route.
- **PII:** emails/phones stripped before sending text to Gemini (classification path).

### 5.2 Reply draft

- On-demand endpoint generates draft; falls back to template if Gemini unavailable.

### 5.3 Environment (AI)

| Variable | Purpose |
|----------|---------|
| `GEMINI_API_KEY` | API key (never commit; use `.env` only) |
| `GEMINI_MODEL_CLASSIFY` | Model id for classify |
| `GEMINI_MODEL_DRAFT` | Model id for drafts |
| `GEMINI_CLASSIFY_ENABLED` | `false` to disable classify API calls (keywords only) |

---

## 6. SLA

- Policies are **per department + priority** (first response hours, resolution hours).
- Deadlines attach when a ticket has a **department** and policy exists.
- **Anchor:** resolution/first-response deadlines are based on **`ticket.createdAt`** (ingest time), not “time of classification.”
- **Cron:** breach marking runs a few times per day; UI countdown updates live.
- **Stale escalation:** tickets in NEW/ASSIGNED with old `updatedAt` may auto-increase priority (see `SlaService`).

---

## 7. Ticket model (conceptual)

- **Statuses:** new, assigned, in_progress, pending, resolved, closed  
- **Priorities:** low, normal, high, critical  
- **Channels:** email, excel, freshdesk, manual  
- **Relations:** department, assignee, creator, notes, replies  
- **AI fields:** category, sentiment, confidence, optional stored draft  
- **SLA fields:** first response / resolution due times, breached flag  

---

## 8. Configuration reference (API `.env`)

See **`apps/api/.env.example`** for the full template. Highlights:

| Area | Variables |
|------|-----------|
| Auth | `JWT_SECRET`, `JWT_EXPIRY`, `JWT_REFRESH_EXPIRY` |
| IMAP | `IMAP_ENABLED`, `IMAP_*`, `IMAP_POLL_INTERVAL_MS`, `IMAP_UID_STATE_FILE`, `IMAP_INCLUDE_UNSEEN_BACKLOG`, `IMAP_INGEST_SKIP_BULK` |
| Outbound mail | `MAIL_HOST`, `MAIL_PORT`, `MAIL_USER`, `MAIL_PASSWORD`, `MAIL_FROM`, `MAIL_AUTO_ACK` (optional disable) |
| CORS / URLs | `FRONTEND_URL`, `PORT` |
| Freshdesk | `FRESHDESK_*` |
| Gemini | `GEMINI_*` |
| Slack | `SLACK_*` (placeholders) |

---

## 9. Operations

### 9.1 First-time setup

```bash
cd unified-ticketing
pnpm install
cd apps/api && copy .env.example .env   # Windows; use cp on Unix
# Edit .env (JWT_SECRET, optional IMAP/Gemini/SMTP)
cd ../..
pnpm run seed
pnpm run dev
```

### 9.2 Seed users

- Password for demo users: **`Demo@1234`** (see README table for emails).
- Re-run **`pnpm run seed`** after schema/user list changes (idempotent skips for existing emails).

### 9.3 Build

```bash
pnpm run build
```

### 9.4 Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| Vite `ws proxy error` / `ECONNREFUSED` | API on :4000 not running; start `pnpm run dev` or `dev:api` |
| No email tickets | `IMAP_ENABLED`, credentials, or UID cursor; check logs |
| Gemini 429 | Quota; set `GEMINI_CLASSIFY_ENABLED=false` or fix billing |
| Auto-ack to wrong address | Provider `From`; set **Reply-To** to customer |
| Wrong department | Keywords/Gemini; use `[HR]` etc. or improve rules |

---

## 10. Security notes (product)

- **Secrets** belong only in **environment variables** or a secrets manager — **never** in git, chat, or client bundles.
- JWT protects API; refresh tokens stored hashed on user row.
- Rotate any API key that has been exposed publicly.
- Production should use **HTTPS**, strong **JWT_SECRET**, **disable synchronize**, and proper **CORS** origins.

---

## 11. Known MVP limitations

- SQLite + sql.js suitable for demo/single-node; scale-out needs Postgres (or similar).
- Excel job status stored **in memory** (lost on restart).
- Freshdesk HMAC verification may need **raw body** parity in production.
- Some notification channels are **logged stubs** (e.g. Slack).

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| **Unified inbox** | One mailbox ingested; routing by content + optional hints |
| **UID cursor** | IMAP high-water mark for which messages were processed |
| **Auto-ack** | SMTP confirmation to requester after email ingest |
| **Circuit (Gemini)** | Temporary stop calling Gemini after repeated failures / 429 |

---

*End of product documentation. For developer quick start, see **`README.md`** in the repository root.*
