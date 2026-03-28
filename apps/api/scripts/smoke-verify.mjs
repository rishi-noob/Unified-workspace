/**
 * Automated smoke: mail routing logic + brief live API (login, tickets list).
 * Run from apps/api after build:  node scripts/smoke-verify.mjs
 * Env: SMOKE_PORT (default 4011), IMAP_DISABLED for child API (set automatically).
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawn } from 'child_process';
import { setTimeout as delay } from 'timers/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const apiRoot = join(__dirname, '..');
const require = createRequire(import.meta.url);

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function runMailRoutingChecks() {
  const { resolveDepartmentIdFromMail } = require(
    join(apiRoot, 'dist/channels/mail/mail-department.router.js'),
  );

  const depts = [
    { id: 'it-id', slug: 'it', emailAlias: 'helpdesk-it@company.com', name: 'IT', isActive: true, createdAt: new Date() },
    { id: 'hr-id', slug: 'hr', emailAlias: 'helpdesk-hr@company.com', name: 'HR', isActive: true, createdAt: new Date() },
    { id: 'tr-id', slug: 'travel', emailAlias: 'helpdesk-travel@company.com', name: 'Travel', isActive: true, createdAt: new Date() },
  ];

  let r = resolveDepartmentIdFromMail(depts, ['rishabhathrit+it@gmail.com'], 'Hello');
  assert(r === 'it-id', `plus-address IT: got ${r}`);

  r = resolveDepartmentIdFromMail(depts, ['rishabhathrit@gmail.com'], '[HR] leave policy');
  assert(r === 'hr-id', `subject tag HR: got ${r}`);

  r = resolveDepartmentIdFromMail(depts, ['helpdesk-travel@company.com'], 'Trip');
  assert(r === 'tr-id', `email alias travel: got ${r}`);

  r = resolveDepartmentIdFromMail(depts, ['rishabhathrit@gmail.com'], 'no tag');
  assert(r === null, `no route: got ${r}`);

  console.log('✅ Mail routing checks passed');
}

async function httpChecks(baseUrl) {
  const loginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@company.com', password: 'Demo@1234' }),
  });
  assert(loginRes.ok, `Login failed HTTP ${loginRes.status} (run: pnpm run seed)`);

  const loginJson = await loginRes.json();
  const token = loginJson.data?.accessToken;
  assert(token, 'No accessToken in envelope');

  const ticketsRes = await fetch(`${baseUrl}/api/v1/tickets?page=1&limit=5`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert(ticketsRes.ok, `Tickets list failed HTTP ${ticketsRes.status}`);

  const ticketsJson = await ticketsRes.json();
  assert(Array.isArray(ticketsJson.data?.items), 'Tickets payload missing data.items');

  console.log(`✅ API smoke OK (${baseUrl}) — tickets page total: ${ticketsJson.data?.total ?? '?'}`);
}

function startApiChild(port) {
  const env = {
    ...process.env,
    IMAP_ENABLED: 'false',
    PORT: String(port),
  };
  const proc = spawn(process.execPath, ['dist/main.js'], {
    cwd: apiRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  proc.stdout?.on('data', () => {});
  proc.stderr?.on('data', () => {});
  return proc;
}

async function waitForHttp(port, attempts = 40) {
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await fetch(`${base}/api/docs`);
      if (r.ok || r.status === 301 || r.status === 302) return base;
    } catch {
      /* retry */
    }
    await delay(500);
  }
  throw new Error(`API did not become ready on port ${port}`);
}

async function main() {
  console.log('— Static: mail-department router');
  runMailRoutingChecks();

  const port = process.env.SMOKE_PORT || '4011';
  console.log(`— Live API: starting Nest on :${port} (IMAP_ENABLED=false for smoke only)`);

  const child = startApiChild(port);
  let baseUrl;
  try {
    baseUrl = await waitForHttp(port);
    await httpChecks(baseUrl);
  } finally {
    child.kill('SIGTERM');
    await delay(500);
    try {
      child.kill('SIGKILL');
    } catch {
      /* ignore */
    }
  }

  console.log('\n✅ All smoke checks passed. You can run `pnpm run dev` with your real .env (IMAP on).');
}

main().catch((e) => {
  console.error('\n❌ Smoke verify failed:', e.message);
  process.exit(1);
});
