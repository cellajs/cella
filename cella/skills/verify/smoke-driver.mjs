// Boot smoke for a checkout or a new app: starts the dev stack, waits for it, signs in as the seeded admin and opens the first pages. See SKILL.md.
// Usage, from the app's repo root: [START='pnpm dev'] [EMAIL=<admin email>] [OUT_DIR=<dir>] node <cella>/cella/skills/verify/smoke-driver.mjs
// START= (empty) attaches to a stack that already answers at the app's URLs.
import { spawn } from 'node:child_process';
import { mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { chromium, mintSession } from '../two-tab-sync-test/driver-lib.mjs';

const OUT = process.env.OUT_DIR ?? join(tmpdir(), 'cella-smoke');
mkdirSync(join(OUT, 'shots'), { recursive: true });
const START = process.env.START ?? 'pnpm dev';
const fileEnv = parseEnv(readFileSync('backend/.env', 'utf8'));
const EMAIL = process.env.EMAIL ?? fileEnv.ADMIN_EMAIL;
if (!EMAIL) throw new Error('No admin email: set EMAIL, or ADMIN_EMAIL in backend/.env.');
const BOOT_MS = 5 * 60_000;
// The first signed-in page of a dev server compiles most of the app on demand
const PAGE_MS = 120_000;

const t0 = Date.now();
const evidence = [];
const checks = [];
const log = (kind, detail) => {
  const entry = { ms: Date.now() - t0, kind, detail };
  evidence.push(entry);
  console.log(`+${String(entry.ms).padStart(6)}ms ${kind}: ${JSON.stringify(detail).slice(0, 400)}`);
};
const check = (what, ok, detail = {}) => {
  checks.push({ what, ok, ...detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${what}${Object.keys(detail).length ? ` ${JSON.stringify(detail).slice(0, 400)}` : ''}`);
  return ok;
};
const fail = (message) => {
  throw new Error(message);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const answers = (url, accept) =>
  fetch(url).then(
    (response) => accept(response.status),
    () => false,
  );

// The session is a database row, so the stack need not run yet; the mint output names the API URL and so the app origin.
const session = mintSession(EMAIL);
const { base, api } = session;
log('target', { base, api, email: EMAIL, start: START || '(attached)' });
// Every service is a path under the app origin; a backendUrl on a port of its own is a config from before that (create-cella < 0.3.8)
if (!check('the API is a path under the app origin', new URL(api).pathname !== '/', { api })) {
  writeFileSync(join(OUT, 'evidence.json'), JSON.stringify({ checks, evidence }, null, 2));
  process.exit(1);
}

let stack = null;
const logPath = join(OUT, 'dev-stack.log');
const stop = () => {
  // The stack runs in its own process group: backend, workers and the frontend server go down together
  if (!stack?.pid) return;
  try {
    process.kill(-stack.pid, 'SIGTERM');
  } catch {
    // It already exited
  }
};
process.on('SIGINT', () => {
  stop();
  process.exit(130);
});

let browser = null;
try {
  if (START) {
    if (await answers(base, (status) => status < 500)) fail(`Something already answers at ${base}. Stop it, or run with START= to smoke that stack.`);
    const [command, ...args] = START.split(/\s+/);
    const out = openSync(logPath, 'w');
    stack = spawn(command, args, { detached: true, stdio: ['ignore', out, out] });
    log('stack', { command: START, pid: stack.pid, log: logPath });
  }

  const deadline = Date.now() + BOOT_MS;
  while (!((await answers(base, (status) => status < 500)) && (await answers(`${api}/health`, (status) => status < 300)))) {
    if (stack && stack.exitCode !== null) fail(`The stack stopped while starting (exit ${stack.exitCode}): see ${logPath}`);
    if (Date.now() > deadline) fail(`Nothing answered at ${base} and ${api}/health within ${BOOT_MS / 60_000} minutes: see ${logPath}`);
    await sleep(2000);
  }
  check('the frontend and the API answer', true, { base, api, ms: Date.now() - t0 });

  if (START) {
    // The CDC worker logs this line once it holds the backend's internal socket; before that no change reaches another tab
    const cdcDeadline = Date.now() + 60_000;
    let connected = false;
    while (!connected && Date.now() < cdcDeadline) {
      connected = readFileSync(logPath, 'utf8').includes('CDC WebSocket connected');
      if (!connected) await sleep(2000);
    }
    check('the CDC worker connected to the backend', connected, { log: logPath });
  }

  const cookie = `${session.cookie.name}=${session.cookie.value}`;
  const call = async (path, init) => {
    const headers = init ? { cookie, 'content-type': 'application/json' } : { cookie };
    const response = await fetch(`${api}${path}`, { method: init?.method, headers, body: init && JSON.stringify(init.body) });
    if (!response.ok) fail(`${init?.method ?? 'GET'} ${path} answered ${response.status}`);
    return response.json();
  };
  const { user } = await call('/me');
  check('the seeded admin signs in', Boolean(user?.id), { email: user?.email ?? EMAIL });
  // Home sends a user who has not finished onboarding to the welcome page; the smoke wants the home page itself
  if (!user.userFlags?.finishedOnboarding) await call('/me', { method: 'PUT', body: { userFlags: { finishedOnboarding: true } } });

  const [{ items: organizations }, { items: memberships }] = await Promise.all([call('/organizations?limit=50'), call('/me/memberships')]);
  check('the seed created organizations', organizations.length > 0, { count: organizations.length });
  const [administered] = memberships
    .filter((membership) => membership.channelType === 'organization' && membership.role === 'admin' && !membership.archived)
    .sort((a, b) => a.displayOrder - b.displayOrder);
  const organization = organizations.find(({ id }) => id === administered?.channelId) ?? organizations[0];

  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
  await context.addCookies([session.cookie]);
  const page = await context.newPage();
  const pageErrors = [];
  const apiFailures = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  page.on('requestfailed', (request) => {
    if (request.url().startsWith(api)) apiFailures.push({ url: request.url(), failure: request.failure()?.errorText });
  });
  page.on('response', (response) => {
    if (response.url().startsWith(api) && response.status() >= 500) apiFailures.push({ url: response.url(), status: response.status() });
  });

  const open = async (path) => {
    await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded' });
    await page.locator('main').first().waitFor({ timeout: PAGE_MS });
    return new URL(page.url()).pathname;
  };
  const shot = (name) => page.screenshot({ path: join(OUT, 'shots', `${name}.png`) });
  const landed = await open('/home');
  await shot('home');
  check('the home page renders', landed === '/home', { landed });

  if (organization) {
    const orgPath = `/${organization.tenantId}/${organization.slug}`;
    await open(`${orgPath}/organization/attachments`);
    const rows = page.locator('.rdg-row');
    await rows.first().waitFor({ timeout: 60_000 }).catch(() => {});
    const count = await rows.count();
    await shot('attachments');
    check('the attachments table shows seeded rows', count > 0, { organization: organization.slug, count });
  }

  check('no page errors', pageErrors.length === 0, { errors: pageErrors.slice(0, 5) });
  check('no failed API requests', apiFailures.length === 0, { failures: apiFailures.slice(0, 5) });
} catch (error) {
  check(error instanceof Error ? error.message : String(error), false);
} finally {
  await browser?.close();
  stop();
  writeFileSync(join(OUT, 'evidence.json'), JSON.stringify({ checks, evidence }, null, 2));
  const failed = checks.filter((entry) => !entry.ok).length;
  console.log(`\n${checks.length - failed}/${checks.length} checks passed. Evidence: ${OUT}`);
  process.exitCode = failed ? 1 : 0;
}
