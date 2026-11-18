// Offline checks on a testbed with its service worker; SKILL.md holds the matrix and the usage.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { loadPlaywright, mintSession, signOut } from '@cellajs/cli/drive';
import { caretToEnd, exactText, rowByName } from '../two-tab-sync-test/driver-lib.mjs';

const OUT = process.env.OUT_DIR ?? process.cwd();
const SHOTS = join(OUT, 'shots');
mkdirSync(SHOTS, { recursive: true });

const EMAIL = process.env.EMAIL ?? 'agent-test@cellajs.com';
const ORG_PATH = process.env.ORG_PATH;
if (!ORG_PATH) throw new Error('ORG_PATH=<tenantId>/<orgSlug>: an organization the user administers, with attachments');
const [TENANT] = ORG_PATH.split('/');
const ATTACHMENTS = `/${ORG_PATH}/organization/attachments`;
// Pages a reload checks, each opened online first; an app adds its own (a board) after the template's.
const PAGES = (process.env.PAGES ?? `/home,${ATTACHMENTS},/account`).split(',');
const ALL = ['reload', 'detect', 'cold', 'nouser', 'auth', 'description'];
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : ALL;

const common = JSON.parse(readFileSync('shared/locales/en/common.json', 'utf8'));
const errors = JSON.parse(readFileSync('shared/locales/en/error.json', 'utf8'));
const noConnection = errors.network_error;
/** The parked-edits notice, up to its entity name. */
const parkedNotice = common['unsaveable_replaced.text'].split('{{name}}')[1].trim().slice(0, 30);

const { chromium } = await loadPlaywright();
const session = mintSession(EMAIL, { hours: 2 });
const BASE = session.frontendUrl;

const asserts = [];
const evidence = [];
const t0 = Date.now();
const log = (kind, detail) => {
  evidence.push({ ms: Date.now() - t0, kind, detail });
  console.log(`+${String(Date.now() - t0).padStart(6)}ms ${kind}: ${JSON.stringify(detail).slice(0, 300)}`);
};
const check = (what, ok, detail, page) => {
  asserts.push({ what, ok });
  log(ok ? 'PASS' : 'FAIL', { what, ...detail });
  if (!ok && page) for (const line of recent.get(page) ?? []) console.log(`    ${line}`);
};

const browser = await chromium.launch();

/** A signed-in browser, its service worker in control and the cache stored: what a returning user's device holds. */
async function device({ warm = PAGES } = {}) {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, locale: 'en-US' });
  await context.addCookies([session.cookie]);
  const page = await context.newPage();
  watch(page);
  for (const path of warm) {
    await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
    await settledPage(page, 20_000);
    // The reads a page starts once it rendered, then the persister's next write (at most one a second): a full page load
    // cuts a write in flight, which drops what the page read last.
    await page.waitForTimeout(2500);
  }
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30_000 });
  // The persister writes once a second; the wait lets the last page's reads reach the store.
  await page.waitForTimeout(2500);
  return { context, page };
}

/** The page's last console lines and errors, which a failed check prints. */
const recent = new WeakMap();
function watch(page) {
  const lines = [];
  recent.set(page, lines);
  const keep = (line) => {
    lines.push(`+${Date.now() - t0}ms ${line.slice(0, 200)}`);
    if (lines.length > 25) lines.shift();
  };
  page.on('console', (message) => keep(`${message.type()} ${message.text()}`));
  page.on('pageerror', (error) => keep(`pageerror ${error.message}`));
  page.on('requestfailed', (request) => keep(`failed ${request.url().replace(BASE, '')} ${request.failure()?.errorText}`));
}

/** No connection at all, as in flight mode; or a network that never answers the API or the relay, as a captive or lossy one. */
async function cut(context, mode) {
  if (mode === 'offline') return context.setOffline(true);
  await context.route('**/api/**', () => {});
  await context.routeWebSocket(/\/yjs\//, () => {});
}
async function restore(context, mode) {
  if (mode === 'offline') return context.setOffline(false);
  await context.unrouteAll({ behavior: 'ignoreErrors' });
}

/**
 * What the page shows: the no-connection notice, a spinner alone, or content. Content counts once the router is idle:
 * before its pending spinner shows, a loading page holds the layout's text and an empty main.
 */
const view = (page) =>
  page
    .evaluate((noConnection) => {
      const text = document.body.textContent;
      const main = document.querySelector('main');
      const idle = (self.__TSR_ROUTER__?.state.status ?? 'idle') === 'idle';
      const spinnerOnly = !!document.querySelector('.animate-spin') && (main?.textContent.trim().length ?? text.trim().length) === 0;
      const filled = main ? main.textContent.trim().length > 0 : text.trim().length > 40;
      return { path: location.pathname, error: text.includes(noConnection), spinnerOnly, content: idle && !spinnerOnly && filled };
    }, noConnection)
    .catch(() => ({ path: '?', error: false, spinnerOnly: true, content: false }));

/** Waits for content or the error notice; resolves what showed and when. */
async function settledPage(page, budgetMs) {
  const started = Date.now();
  let seen = await view(page);
  while (Date.now() - started < budgetMs && !seen.error && !seen.content) {
    await page.waitForTimeout(200);
    seen = await view(page);
  }
  return { ...seen, ms: Date.now() - started };
}

async function experiment(name, run) {
  if (!ONLY.includes(name)) return;
  log('experiment', name);
  try {
    await run();
  } catch (error) {
    check(`${name} ran to the end`, false, { error: String(error).slice(0, 300) });
  }
}

const shot = (page, name) => page.screenshot({ path: join(SHOTS, `${name}.png`) }).catch(() => {});

// A reload of every page opened before renders it from the device, with no notice: in a few seconds offline, and once the
// probe gave up on an API that never answers.
await experiment('reload', async () => {
  for (const mode of ['offline', 'unreachable']) {
    const { context, page } = await device();
    await cut(context, mode);
    for (const path of PAGES) {
      await page.goto(BASE + path, { waitUntil: 'commit' });
      const seen = await settledPage(page, mode === 'offline' ? 5000 : 15_000);
      // A page opened before stays where it is: a redirect home means its route could not read what the device holds.
      check(`reload ${mode}: ${path} renders from the device`, seen.content && !seen.error && seen.path === path, seen, page);
      await shot(page, `reload-${mode}${path.replaceAll('/', '_')}`);
    }
    await context.close();
  }
});

// The API stops answering while the network stays up: the app counts as offline within a probe, not three.
await experiment('detect', async () => {
  const { context, page } = await device({ warm: [PAGES[0]] });
  await cut(context, 'unreachable');
  const started = Date.now();
  const offline = page.waitForEvent('console', { predicate: (m) => m.text().includes('[Offline] Network: offline'), timeout: 30_000 });
  await page.reload({ waitUntil: 'commit' });
  await offline.catch(() => null);
  const ms = Date.now() - started;
  check('an API that never answers counts as offline within 10s', ms < 10_000, { ms });
  await context.close();
});

/** Empties the stored query cache, as the first boot of a release with another cache version does. */
const dropStoredQueries = (page) =>
  page.evaluate(async () => {
    // The per-user database is `<slug>:<user id>`, the user being the one the user store names.
    const userKey = Object.keys(localStorage).find((key) => key.endsWith('-user'));
    const userId = JSON.parse(localStorage.getItem(userKey) ?? '{}').state?.user?.id;
    const name = (await indexedDB.databases()).map((db) => db.name).find((n) => userId && n?.endsWith(`:${userId}`));
    if (!name) throw new Error(`no database for the stored user ${userId}`);
    const db = await new Promise((resolve) => {
      const request = indexedDB.open(name);
      request.onsuccess = () => resolve(request.result);
    });
    await new Promise((resolve) => {
      const tx = db.transaction(['queries', 'meta'], 'readwrite');
      tx.objectStore('queries').clear();
      const meta = tx.objectStore('meta');
      const read = meta.get('rq');
      read.onsuccess = () => read.result && meta.put({ ...read.result, bundledQueries: [] });
      tx.oncomplete = resolve;
    });
    db.close();
  });

/** Clears the stored user and keeps the last one, as a lost session leaves the browser. */
const dropStoredUser = (page) =>
  page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.endsWith('-user'));
    const stored = JSON.parse(localStorage.getItem(key));
    stored.state.user = null;
    localStorage.setItem(key, JSON.stringify(stored));
  });

/** A fresh tab on the same device: a reload would write the memory of the old page back over the change. */
async function reopen(context, page, path) {
  const next = await context.newPage();
  watch(next);
  await page.close();
  await next.goto(BASE + path, { waitUntil: 'commit' });
  return next;
}

// Nothing cached, offline: the app shell renders with what the device holds, never the no-connection notice for a menu read.
await experiment('cold', async () => {
  for (const mode of ['offline', 'unreachable']) {
    const { context, page } = await device();
    await cut(context, mode);
    await dropStoredQueries(page);
    const next = await reopen(context, page, PAGES.at(-1));
    const seen = await settledPage(next, mode === 'offline' ? 5000 : 20_000);
    check(`cold boot ${mode}: the app renders, no notice`, seen.content && !seen.error, seen, next);
    await shot(next, `cold-${mode}`);
    await context.close();
  }
});

// No stored user, offline: the notice shows, and the page loads by itself once the connection is back.
await experiment('nouser', async () => {
  const { context, page } = await device();
  await cut(context, 'offline');
  await dropStoredUser(page);
  const next = await reopen(context, page, PAGES.at(-1));
  const seen = await settledPage(next, 5000);
  check('no stored user, offline: the no-connection notice', seen.error, seen, next);
  await restore(context, 'offline');
  const started = Date.now();
  let back = await view(next);
  while (Date.now() - started < 10_000 && (back.error || !back.content)) {
    await next.waitForTimeout(200);
    back = await view(next);
  }
  check('… and the page loads by itself once back online', back.content && !back.error, { ...back, ms: Date.now() - started }, next);
  await context.close();
});

/** Waits for the path to start with `prefix`; resolves the path it ended on. */
async function landsOn(page, prefix, budgetMs = 10_000) {
  const started = Date.now();
  let path = new URL(page.url()).pathname;
  while (Date.now() - started < budgetMs && !path.startsWith(prefix)) {
    await page.waitForTimeout(200);
    path = new URL(page.url()).pathname;
  }
  return path;
}

// The sign-in page while a session holds: it leaves for where sign-in would lead, online and offline, and once the
// connection is back when the browser kept no user.
await experiment('auth', async () => {
  const { context, page } = await device({ warm: [PAGES[0]] });
  await page.goto(`${BASE}/auth/authenticate`, { waitUntil: 'commit' });
  check('signed in: /auth/authenticate leaves for home', (await landsOn(page, '/home')).startsWith('/home'));
  await page.goto(`${BASE}/auth/authenticate?redirect=${encodeURIComponent('/account')}`, { waitUntil: 'commit' });
  check('signed in: /auth/authenticate follows its redirect', (await landsOn(page, '/account')).startsWith('/account'));
  await cut(context, 'offline');
  await page.goto(`${BASE}/auth/authenticate`, { waitUntil: 'commit' });
  check('signed in, offline: /auth/authenticate leaves for home', (await landsOn(page, '/home')).startsWith('/home'));
  await dropStoredUser(page);
  const next = await reopen(context, page, '/auth/authenticate');
  await next.waitForTimeout(2000);
  check('no stored user, offline: the sign-in page stays', new URL(next.url()).pathname.startsWith('/auth/authenticate'));
  await restore(context, 'offline');
  check('… and leaves once back online, the session being valid', (await landsOn(next, '/home', 15_000)).startsWith('/home'), {}, next);
  await context.close();
});

/** Opens a row's description sheet in edit mode through its table cell (see two-tab-sync-test). */
async function openDescription(page, name) {
  await rowByName(page, name).first().waitFor({ timeout: 30_000 });
  const headers = await page.locator('[role="columnheader"]').allTextContents();
  const column = headers.findIndex((header) => exactText(common.description).test(header.trim()));
  if (column < 0) throw new Error(`no description column in ${JSON.stringify(headers)}`);
  await rowByName(page, name).first().locator('[role="gridcell"][aria-colindex]').nth(column).dblclick();
  const sheet = page
    .getByRole('dialog')
    .filter({ has: page.getByRole('heading', { name: exactText(name) }) })
    .last();
  await sheet.waitFor({ timeout: 15_000 });
  const editor = sheet.locator('.bn-editor[contenteditable="true"]').first();
  await editor.waitFor({ timeout: 20_000 });
  await page.waitForTimeout(500);
  return editor;
}

// A row another device edited online since its document was made: this device never opened it, edits it offline after a
// reload, and reconnects. The edit reaches the server with no parked-edits notice.
await experiment('description', async () => {
  const other = await device({ warm: [ATTACHMENTS] });
  const ids = { organization: null, entity: null };
  other.page.on('request', (request) => {
    ids.organization ??= request.url().match(/\/organizations\/([0-9a-f-]{36})\//)?.[1] ?? null;
  });
  other.page.on('websocket', (socket) => {
    if (socket.url().includes('/yjs/')) ids.entity = new URL(socket.url()).pathname.split('/').pop();
  });
  await other.page.reload({ waitUntil: 'domcontentloaded' });
  const name = process.env.ROW ?? (await other.page.locator('.rdg-row span.truncate.font-medium').first().textContent());
  const editor = await openDescription(other.page, name);
  await caretToEnd(other.page, editor);
  await other.page.keyboard.type(` online-${Date.now() % 100000}`, { delay: 20 });
  await other.page.keyboard.press('Escape');
  await other.page.waitForTimeout(3000);
  await other.context.close();
  if (!ids.organization || !ids.entity) throw new Error(`no ids read off the page: ${JSON.stringify(ids)}`);
  const row = `${BASE}/api/tenants/${TENANT}/organizations/${ids.organization}/attachments/${ids.entity}`;

  const { context, page } = await device({ warm: [ATTACHMENTS] });
  await cut(context, 'offline');
  await page.reload({ waitUntil: 'commit' });
  const offline = `offline-${Date.now() % 100000}`;
  const offlineEditor = await openDescription(page, name);
  await caretToEnd(page, offlineEditor);
  await page.keyboard.type(` ${offline}`, { delay: 20 });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1500);
  await restore(context, 'offline');

  const started = Date.now();
  let saved = false;
  while (!saved && Date.now() - started < 30_000) {
    await page.waitForTimeout(1000);
    const answer = await page.request.get(row, { headers: { origin: BASE } }).catch(() => null);
    const body = answer ? await answer.text() : '';
    saved = !!answer?.ok() && body.includes(offline);
    if (!saved) log('server row', { status: answer?.status() ?? null, body: body.slice(0, 160) });
  }
  const toasts = (await page.locator('[data-slot="toast"]').allTextContents()).join(' | ');
  check('offline edit of a row edited elsewhere reaches the server', saved, { ms: Date.now() - started, row: name });
  check('… with no parked-edits notice', !toasts.includes(parkedNotice), { toasts: toasts.slice(0, 200) });
  await shot(page, 'description');
  await context.close();
});

await browser.close();
await signOut(session);
writeFileSync(join(OUT, 'offline-evidence.json'), JSON.stringify({ asserts, evidence }, null, 2));
const failed = asserts.filter((a) => !a.ok);
console.log(
  `\n${asserts.length - failed.length}/${asserts.length} passed${failed.length ? `; failed: ${failed.map((a) => a.what).join('; ')}` : ''}`,
);
process.exit(failed.length ? 1 : 0);
