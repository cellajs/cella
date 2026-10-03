// Collaborative description checks for attachments, with two users. See SKILL.md for the experiment matrix.
// One browser context per user (own session, own storage): user A acts, user B keeps the description open and observes.
// Usage, from the repo root: [EMAIL=..] [EMAIL_B=..] [EMAIL_VIEWER=..] [ORG_PATH=..] [ROW=..] [DELETE_ROW=..] [ONLY=..] [OUT_DIR=..] node cella/skills/two-tab-sync-test/description-driver.mjs
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { caretToEnd, chromium, editorText, exactText, mintSession, rowByName } from './driver-lib.mjs';

const OUT = process.env.OUT_DIR ?? process.cwd();
const SHOTS = join(OUT, 'shots');
mkdirSync(SHOTS, { recursive: true });

const EMAIL = process.env.EMAIL ?? 'xbench-user-0000@xbench.local';
const EMAIL_B = process.env.EMAIL_B ?? 'xbench-user-0001@xbench.local';
const EMAIL_VIEWER = process.env.EMAIL_VIEWER;
const ORG_PATH = process.env.ORG_PATH ?? 'xbench/xbench-org';
const [TENANT] = ORG_PATH.split('/');
const ALL = ['live', 'typing', 'outside', 'viewer', 'offline', 'outage', 'signout', 'tabs', 'delete'];
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : ALL;
const runs = (name) => ONLY.includes(name);

// Status lines and button labels as this checkout words them, so a copy change breaks no assert.
const strings = JSON.parse(readFileSync('locales/en/common.json', 'utf8'));

const sessions = { a: mintSession(EMAIL), b: mintSession(EMAIL_B), viewer: EMAIL_VIEWER ? mintSession(EMAIL_VIEWER) : null };
const cookies = { a: sessions.a.cookie, b: sessions.b.cookie, viewer: sessions.viewer?.cookie ?? null };
const BASE = sessions.a.base;
const URL_ATTACHMENTS = `${BASE}/${ORG_PATH}/organization/attachments`;

const evidence = [];
const asserts = [];
const t0 = Date.now();
const log = (tab, kind, detail) => {
  const entry = { ms: Date.now() - t0, tab, kind, detail };
  evidence.push(entry);
  if (kind !== 'console') console.log(`+${String(entry.ms).padStart(6)}ms [${tab}] ${kind}: ${JSON.stringify(detail).slice(0, 400)}`);
};
const check = (what, ok, detail = {}) => {
  asserts.push({ what, ok });
  log('assert', ok ? 'assert-pass' : 'assert-fail', { what, ...detail });
};

/** Console, relay sockets and the relay's HTTP routes of one page; `seen` holds what an assert needs. */
function instrument(page, tab) {
  const seen = { sockets: 0, tokenRequests: 0, entityId: null, organizationId: null };
  page.on('console', (msg) => log(tab, 'console', { type: msg.type(), text: msg.text().slice(0, 500) }));
  page.on('pageerror', (err) => log(tab, 'pageerror', { message: String(err).slice(0, 500) }));
  page.on('websocket', (ws) => {
    if (!ws.url().includes('/yjs/')) return;
    seen.sockets++;
    seen.entityId = new URL(ws.url()).pathname.split('/').pop();
    log(tab, 'relay-connect', { url: ws.url().replace(/token=[^&]+/, 'token=…').slice(0, 160) });
    ws.on('close', () => log(tab, 'relay-close', {}));
  });
  // Pull and push over HTTP mean the socket is out of reach.
  page.on('response', (res) => {
    const match = /\/([^/]+)\/yjs\/(token|pull|push)/.exec(res.url());
    if (!match) return;
    if (match[2] === 'token') {
      seen.tokenRequests++;
      seen.organizationId = match[1];
    }
    log(tab, 'relay-http', { status: res.status(), route: match[2] });
  });
  return seen;
}

const shot = (page, name) => page.screenshot({ path: join(SHOTS, `${name}.png`) }).catch(() => {});

async function pollFor(predicate, timeoutMs, intervalMs = 250) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if (await predicate()) return { ok: true, afterMs: Date.now() - start };
    } catch { /* the page is between states: ask again */ }
    await new Promise((done) => setTimeout(done, intervalMs));
  }
  return { ok: false, afterMs: timeoutMs };
}

const marker = (prefix) => `${prefix}-${Date.now().toString(36)}`;

const browser = await chromium.launch({ headless: true });

/** One signed-in user with storage of its own. `relay` takes the relay away from this user alone. */
async function user(tab, cookie) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, locale: 'en-US' });
  await context.addCookies([cookie]);
  // DevTools URL blocking does not stop a WebSocket handshake, so relay sockets are routed: passed through while up;
  // while down, open ones are dropped and new ones closed at once.
  const relay = { down: false, live: new Set(), passed: 0 };
  await context.routeWebSocket(/\/yjs\//, (ws) => {
    if (relay.down) return void ws.close({ code: 1001, reason: 'relay down' });
    relay.passed++;
    ws.connectToServer();
    relay.live.add(ws);
  });
  relay.set = async (down) => {
    relay.down = down;
    log(tab, 'relay', { down });
    if (!down) return;
    for (const ws of relay.live) await ws.close({ code: 1001, reason: 'relay down' }).catch(() => {});
    relay.live.clear();
  };
  const newPage = async (name = tab) => {
    const page = await context.newPage();
    return { page, seen: instrument(page, name) };
  };
  return { tab, context, relay, newPage, ...(await newPage()) };
}

/** Blocks the relay's HTTP routes for one page, or none of them: with the relay down too, no edit reaches a server. */
async function blockRelayHttp(page, blocked) {
  page.cdp ??= await page.context().newCDPSession(page);
  await page.cdp.send('Network.enable');
  await page.cdp.send('Network.setBlockedURLs', { urls: blocked ? ['*/yjs/pull*', '*/yjs/push*', '*/yjs/token*'] : [] });
}

/** Opens a row's description sheet through its table cell. An editor's cell opens it in edit mode, a viewer's from its text. */
async function openDescription(page, name) {
  if (!page.url().startsWith(URL_ATTACHMENTS)) await page.goto(URL_ATTACHMENTS, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await rowByName(page, name).first().waitFor({ timeout: 60_000 });
  const headers = await page.locator('[role="columnheader"]').allTextContents();
  const column = headers.findIndex((h) => exactText(strings.description).test(h.trim()));
  if (column < 0) throw new Error(`no description column in ${JSON.stringify(headers)}`);
  await rowByName(page, name).first().locator('[role="gridcell"][aria-colindex]').nth(column).dblclick();
  const sheet = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: exactText(name) }) }).last();
  await sheet.waitFor({ timeout: 15_000 });
  return { sheet, editor: sheet.locator('.bn-editor[contenteditable="true"]').first() };
}

/** Opens the editor. It takes focus and places its caret by itself right after it shows; a key pressed in that instant races it. */
async function openEditor(page, name) {
  const opened = await openDescription(page, name);
  await opened.editor.waitFor({ timeout: 20_000 });
  await page.waitForTimeout(500);
  return opened;
}

/** Opens the editor and focuses it: from the first focus on, the document is stored and opens offline. */
async function openStored(page, name) {
  const opened = await openEditor(page, name);
  await opened.editor.click();
  await page.waitForTimeout(1500);
  return opened;
}

const statusText = async (sheet) => (await sheet.locator('p[role="status"]').allTextContents()).join(' | ');
const toastText = async (page) => (await page.locator('[data-slot="toast"]').allTextContents()).join(' | ');

async function typeAtEnd(page, editor, text, delay = 20) {
  await caretToEnd(page, editor);
  await page.keyboard.type(text, { delay });
}

const a = await user('A', cookies.a);
const b = await user('B', cookies.b);
// The peer's session calls the API for server truth, the outside write and the delete; the origin header passes the CSRF check.
const api = (path, options = {}) =>
  b.context.request.fetch(`${BASE}/api/${TENANT}/${b.seen.organizationId}/attachments${path}`, { ...options, headers: { origin: BASE } });
const serverDescription = async (id) => String((await (await api(`/${id}`)).json()).description ?? '');
const stx = (fields) => ({ mutationId: randomUUID(), sourceId: randomUUID(), ...(fields && { fieldTimestamps: fields }) });

/** One experiment: a failure is recorded and the next one still runs. */
async function experiment(name, run) {
  if (!runs(name)) return;
  try {
    await run();
  } catch (err) {
    check(`${name}: ran to the end`, false, { message: String(err).slice(0, 400) });
    await shot(a.page, `${name}-ERROR-A`);
    await shot(b.page, `${name}-ERROR-B`);
  }
}

try {
  await a.page.goto(URL_ATTACHMENTS, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await a.page.locator('.rdg-row').first().waitFor({ timeout: 60_000 });
  const names = await a.page.locator('.rdg-row span.truncate.font-medium').allTextContents();
  const ROW = process.env.ROW ?? names[0];
  const DELETE_ROW = process.env.DELETE_ROW ?? names.find((name) => name !== ROW);
  log('harness', 'target', { url: URL_ATTACHMENTS, cookie: cookies.a.name, editors: [EMAIL, EMAIL_B], viewer: EMAIL_VIEWER ?? null, ROW, DELETE_ROW });

  // The peer keeps the description open for the whole run and observes.
  const peer = await openEditor(b.page, ROW);
  const rowId = b.seen.entityId;
  let lastMarker = null;

  // ── Experiment 1: live typing and cursors ──────────────────────────────────
  await experiment('live', async () => {
    const { sheet, editor } = await openEditor(a.page, ROW);
    lastMarker = marker('live');
    await typeAtEnd(a.page, editor, ` ${lastMarker}`);
    const live = await pollFor(async () => (await editorText(peer.editor)).includes(lastMarker), 10_000, 100);
    check('live: typed text appears in the peer editor', live.ok, live);
    const cursor = peer.sheet.locator('.bn-collaboration-cursor__base');
    const shown = await pollFor(async () => (await cursor.count()) > 0, 5_000, 100);
    check('live: the peer sees the cursor', shown.ok, shown);
    await shot(b.page, '01-live-peer');
    // The relay passes two awareness frames a second per socket and drops the rest: a removal right after a cursor move is one of them
    await a.page.waitForTimeout(600);
    await a.page.keyboard.press('Escape');
    await sheet.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
    const left = await pollFor(async () => (await cursor.count()) === 0, 30_000, 100);
    check('live: the cursor leaves when the sheet closes', left.ok, left);
  });

  // ── Experiment 2: the row saves while typing goes on ───────────────────────
  await experiment('typing', async () => {
    const { editor } = await openEditor(a.page, ROW);
    lastMarker = marker('typing');
    const start = Date.now();
    await typeAtEnd(a.page, editor, ` ${lastMarker} `);
    let savedAfterMs = null;
    // The relay saves 3s after the last keystroke, and at most 10s into nonstop typing
    while (Date.now() - start < 15_000) {
      await a.page.keyboard.type('typing ', { delay: 60 });
      if (savedAfterMs === null && (await serverDescription(rowId)).includes(lastMarker)) savedAfterMs = Date.now() - start;
    }
    check('typing: the server row is saved while typing goes on', savedAfterMs !== null && savedAfterMs < 13_000, { savedAfterMs });
    await a.page.keyboard.press('Escape');
  });

  // ── Experiment 3: an outside write shows in open editors ───────────────────
  await experiment('outside', async () => {
    const { editor } = await openEditor(a.page, ROW);
    await a.page.waitForTimeout(4000); // past the save of the typing before
    const sockets = a.seen.sockets + b.seen.sockets;
    const toasts = (await toastText(a.page)) + (await toastText(b.page));
    const blocks = JSON.parse((await serverDescription(rowId)) || '[]');
    const kept = lastMarker;
    lastMarker = marker('outside');
    blocks.push({ id: randomUUID(), type: 'paragraph', props: {}, content: [{ type: 'text', text: lastMarker, styles: {} }], children: [] });
    // A scalar op needs its field timestamp, an HLC: <ms>:<counter>:<5 chars of source>
    const data = { ops: { description: JSON.stringify(blocks) }, stx: stx({ description: `${Date.now()}:0000:probe` }) };
    const res = await api(`/${rowId}`, { method: 'PUT', data });
    const inA = await pollFor(async () => (await editorText(editor)).includes(lastMarker), 10_000, 100);
    const inB = await pollFor(async () => (await editorText(peer.editor)).includes(lastMarker), 10_000, 100);
    check('outside: the write shows in both open editors', res.ok() && inA.ok && inB.ok, { status: res.status(), a: inA.afterMs, b: inB.afterMs });
    check('outside: no editor reconnects', a.seen.sockets + b.seen.sockets === sockets);
    check('outside: no toast', (await toastText(a.page)) + (await toastText(b.page)) === toasts);
    if (kept) check('outside: text typed before the write is kept', (await editorText(peer.editor)).includes(kept));
    await shot(b.page, '03-outside-peer');
    await a.page.keyboard.press('Escape');
  });

  // ── Experiment 4: a member who may only read ───────────────────────────────
  await experiment('viewer', async () => {
    if (!cookies.viewer) return log('harness', 'viewer-skipped', { reason: 'no EMAIL_VIEWER' });
    const viewer = await user('viewer', cookies.viewer);
    const { sheet } = await openDescription(viewer.page, ROW);
    await viewer.page.waitForTimeout(3000);
    const editable = await sheet.locator('[contenteditable="true"]').count();
    check('viewer: the static only, no token and no socket', editable === 0 && viewer.seen.sockets === 0 && viewer.seen.tokenRequests === 0, {
      editable,
      sockets: viewer.seen.sockets,
      tokenRequests: viewer.seen.tokenRequests,
    });
    if (lastMarker) check('viewer: the static shows the saved text', ((await sheet.textContent()) ?? '').includes(lastMarker));
    await shot(viewer.page, '04-viewer');
    await viewer.context.close();
  });
  await a.context.close();

  // ── Experiment 5: offline from storage, then back online ───────────────────
  await experiment('offline', async () => {
    const me = await user('A', cookies.a);
    await openStored(me.page, ROW);
    await me.page.keyboard.press('Escape');
    await me.context.setOffline(true);
    log('A', 'offline', {});
    await me.page.waitForTimeout(1000);
    const { sheet, editor } = await openDescription(me.page, ROW);
    const opened = await pollFor(async () => (await editor.count()) > 0, 10_000);
    check('offline: the stored document opens editable', opened.ok, { ...opened, status: await statusText(sheet) });
    const text = marker('offline');
    await typeAtEnd(me.page, editor, ` ${text}`);
    const kept = await pollFor(async () => (await statusText(sheet)) === strings['collaboration_offline.text'], 5_000);
    check('offline: the status says the edits are kept', kept.ok, { status: await statusText(sheet) });
    await me.page.waitForTimeout(2000);
    check('offline: the peer gets nothing', !(await editorText(peer.editor)).includes(text));
    await shot(me.page, '05-offline');
    await me.page.keyboard.press('Escape');
    await me.page.waitForTimeout(800);
    const again = await openDescription(me.page, ROW);
    await again.editor.waitFor({ timeout: 10_000 });
    check('offline: the edit is there after closing and reopening', (await editorText(again.editor)).includes(text));

    const toasts = await toastText(me.page);
    await me.context.setOffline(false);
    log('A', 'online', {});
    const reached = await pollFor(async () => (await editorText(peer.editor)).includes(text), 20_000);
    check('online: the offline edit reaches the peer', reached.ok, reached);
    const saved = await pollFor(async () => (await serverDescription(rowId)).includes(text), 30_000, 500);
    check('online: the offline edit reaches the server row', saved.ok, saved);
    const cleared = await pollFor(async () => (await statusText(again.sheet)) === '', 10_000);
    check('online: the status clears', cleared.ok, { status: await statusText(again.sheet) });
    check('online: no notice about discarded edits', (await toastText(me.page)) === toasts, { toast: await toastText(me.page) });
    await me.context.close();
  });

  // ── Experiment 6: the relay goes away and comes back ───────────────────────
  await experiment('outage', async () => {
    const me = await user('A', cookies.a);
    const { sheet, editor } = await openStored(me.page, ROW);
    await me.relay.set(true);
    const limited = await pollFor(async () => (await statusText(sheet)) === strings['sync_limited.text'], 20_000);
    check('outage: the status turns to limited sync', limited.ok, { ...limited, status: await statusText(sheet) });
    check('outage: the editor stays editable', (await editor.count()) === 1);
    const pushed = marker('http');
    await typeAtEnd(me.page, editor, ` ${pushed}`);
    const reached = await pollFor(async () => (await editorText(peer.editor)).includes(pushed), 15_000);
    check('outage: an edit pushed over HTTP reaches the peer', reached.ok, reached);
    const pulled = marker('peer');
    await typeAtEnd(b.page, peer.editor, ` ${pulled}`);
    const arrived = await pollFor(async () => (await editorText(editor)).includes(pulled), 25_000);
    check('outage: the peer edit arrives with a pull', arrived.ok, arrived);
    await shot(me.page, '06-outage');

    const passed = me.relay.passed;
    await me.relay.set(false);
    const back = await pollFor(async () => (await statusText(sheet)) === '' && me.relay.passed > passed, 60_000, 500);
    check('outage: back on the relay with no reload', back.ok, { ...back, status: await statusText(sheet) });
    const text = marker('back');
    await typeAtEnd(me.page, editor, ` ${text}`);
    const live = await pollFor(async () => (await editorText(peer.editor)).includes(text), 5_000, 100);
    check('outage: live again after the switch', live.ok, live);
    await me.context.close();
  });

  // ── Experiment 7: sign-out with edits no server holds ──────────────────────
  await experiment('signout', async () => {
    const me = await user('A', cookies.a);
    const { editor } = await openStored(me.page, ROW);
    await blockRelayHttp(me.page, true);
    await me.relay.set(true);
    await me.page.waitForTimeout(1000);
    const text = marker('unsynced');
    await typeAtEnd(me.page, editor, ` ${text}`);
    await me.page.waitForTimeout(3000);
    await me.page.goto(`${BASE}/auth/sign-out`, { waitUntil: 'domcontentloaded' });
    const dialog = me.page.getByRole('dialog').filter({ hasText: strings['confirm.sign_out_unsaved'] });
    const asked = await pollFor(async () => (await dialog.count()) > 0, 15_000);
    const listed = asked.ok ? ((await dialog.textContent()) ?? '') : '';
    check('signout: the dialog asks and lists the document', asked.ok && listed.includes(ROW), { ...asked, listed: listed.slice(0, 200) });
    await shot(me.page, '07-signout-dialog');
    if (asked.ok) {
      await dialog.getByRole('button', { name: exactText(strings.keep_editing) }).click();
      const stayed = await pollFor(async () => !me.page.url().includes('sign-out'), 5_000);
      check('signout: "keep editing" leaves the sign-out page, signed in', stayed.ok, { url: me.page.url() });
    }
    await blockRelayHttp(me.page, false);
    await me.relay.set(false);
    const saved = await pollFor(async () => (await serverDescription(rowId)).includes(text), 60_000, 1000);
    check('signout: the kept edit saves once a server is in reach', saved.ok, saved);
    await me.context.close();
  });

  // ── Experiment 8: two tabs of one user, offline ────────────────────────────
  await experiment('tabs', async () => {
    const me = await user('A1', cookies.a);
    const second = await me.newPage('A2');
    const one = await openStored(me.page, ROW);
    const two = await openStored(second.page, ROW);
    await me.context.setOffline(true);
    await me.page.waitForTimeout(1000);
    const [first, other] = [marker('tab1'), marker('tab2')];
    await typeAtEnd(me.page, one.editor, ` ${first}`);
    await typeAtEnd(second.page, two.editor, ` ${other}`);
    const crossed = await pollFor(async () => (await editorText(one.editor)).includes(other) && (await editorText(two.editor)).includes(first), 10_000);
    check('tabs: each tab shows the other tab edit while offline', crossed.ok, crossed);
    await me.context.setOffline(false);
    const both = await pollFor(async () => {
      const description = await serverDescription(rowId);
      return description.includes(first) && description.includes(other);
    }, 45_000, 1000);
    check('tabs: both edits reach the server row', both.ok, both);
    check('tabs: both tabs show the same text', (await editorText(one.editor)) === (await editorText(two.editor)));
    await me.context.close();
  });

  // ── Experiment 9: the entity is deleted under unsaved edits ────────────────
  await experiment('delete', async () => {
    if (!DELETE_ROW) return log('harness', 'delete-skipped', { reason: 'no second row' });
    const me = await user('A', cookies.a);
    const { sheet, editor } = await openStored(me.page, DELETE_ROW);
    const doomedId = me.seen.entityId;
    await blockRelayHttp(me.page, true);
    await me.relay.set(true);
    await me.page.waitForTimeout(1000);
    await typeAtEnd(me.page, editor, ` ${marker('doomed')}`);
    await me.page.waitForTimeout(1500);
    const res = await api('', { method: 'DELETE', data: { ids: [doomedId], stx: stx() } });
    log('B', 'action', { did: 'delete', name: DELETE_ROW, status: res.status() });
    await me.page.waitForTimeout(3000);
    await blockRelayHttp(me.page, false);
    await me.relay.set(false);
    const noticed = await pollFor(async () => (await toastText(me.page)).includes(strings.copy_text), 45_000, 500);
    const toast = await toastText(me.page);
    check('delete: a notice offers to copy or discard the unsaved edits', noticed.ok && toast.includes(strings.discard), { ...noticed, toast: toast.slice(0, 200) });
    const status = await statusText(sheet).catch(() => 'sheet closed');
    check('delete: the open description says deleted', status === strings.deleted, { status });
    await shot(me.page, '09-delete-notice');
    await me.context.close();
  });
} catch (err) {
  log('harness', 'error', { message: String(err).slice(0, 800) });
  await shot(b.page, '99-error-peer');
} finally {
  writeFileSync(join(OUT, 'description-evidence.json'), JSON.stringify(evidence, null, 1));
  await browser.close();
  const failed = asserts.filter((assert) => !assert.ok);
  console.log(`\n${asserts.length - failed.length}/${asserts.length} asserts passed -> ${join(OUT, 'description-evidence.json')}`);
  for (const assert of failed) console.log(`FAIL ${assert.what}`);
  if (failed.length || !asserts.length) process.exitCode = 1;
}
