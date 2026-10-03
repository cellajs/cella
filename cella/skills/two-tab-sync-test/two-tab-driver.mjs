// Two-tab realtime sync diagnosis for attachments and their descriptions. See SKILL.md for the experiment matrix.
// Drives two signed-in tabs (shared session, real tab-coordinator semantics); captures per-tab console, seqCursor network bodies, SSE and relay connections, screenshots.
// Usage, from the repo root: [EMAIL=<user email>] [ORG_PATH=<tenantId>/<orgSlug>] [OUT_DIR=...] node cella/skills/two-tab-sync-test/two-tab-driver.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { caretToEnd, chromium, editorText, exactText, mintSession, rowByName } from './driver-lib.mjs';

const OUT = process.env.OUT_DIR ?? process.cwd();
const SHOTS = join(OUT, 'shots');
mkdirSync(SHOTS, { recursive: true });

const EMAIL = process.env.EMAIL ?? 'xbench-user-0000@xbench.local';
const ORG_PATH = process.env.ORG_PATH ?? 'xbench/xbench-org';

const { base: BASE, cookie: COOKIE } = mintSession(EMAIL);
const URL_ATTACHMENTS = `${BASE}/${ORG_PATH}/organization/attachments`;

const evidence = [];
const createPosts = [];
// Text typed into a description; a delta fetch reports whether the server row holds it yet.
let watchedText = null;
const t0 = Date.now();
const log = (tab, kind, detail) => {
  const entry = { ms: Date.now() - t0, tab, kind, detail };
  evidence.push(entry);
  if (kind !== 'console' || /CacheOps|handleEntity|handleApp|TabCoordinator|stream|sync|seq|yjs/i.test(String(detail?.text ?? ''))) {
    console.log(`+${String(entry.ms).padStart(6)}ms [${tab}] ${kind}: ${JSON.stringify(detail).slice(0, 400)}`);
  }
};

function instrument(page, tab) {
  page.on('console', (msg) => log(tab, 'console', { type: msg.type(), text: msg.text().slice(0, 500) }));
  page.on('pageerror', (err) => log(tab, 'pageerror', { message: String(err).slice(0, 500) }));
  page.on('request', (req) => {
    const u = req.url();
    // GET opens the SSE stream, POST on the same path is the catchup request
    if (u.includes('/entities/app/stream')) log(tab, 'sse-connect', { method: req.method(), url: u });
  });
  // The description editor syncs over the relay socket; pull and push over HTTP mean the socket is out of reach.
  page.on('websocket', (ws) => {
    if (!ws.url().includes('/yjs')) return;
    log(tab, 'relay-connect', { url: ws.url().replace(/token=[^&]+/, 'token=…').slice(0, 160) });
    ws.on('close', () => log(tab, 'relay-close', {}));
  });
  page.on('response', async (res) => {
    const u = res.url();
    const method = res.request().method();
    if (u.includes('seqCursor')) {
      let items = null;
      try {
        const body = await res.json();
        items = (body.items ?? body.data?.items ?? []).map((i) => ({
          id: i.id,
          name: i.name,
          deletedAt: i.deletedAt ?? null,
          seq: i.seq ?? null,
          ...(watchedText && { hasWatchedText: String(i.description ?? '').includes(watchedText) }),
        }));
      } catch { /* non-json */ }
      log(tab, 'delta-fetch', { status: res.status(), url: u.slice(u.indexOf('?')), items });
    } else if (/\/yjs\/(token|pull|push)/.test(u)) {
      log(tab, 'relay-http', { status: res.status(), path: new URL(u).pathname.split('/').slice(-2).join('/') });
    } else if (method === 'POST' && /\/attachments$/.test(u.split('?')[0])) {
      let ids = null;
      try { const body = await res.json(); ids = (body.data ?? []).map((i) => i?.id); } catch {}
      createPosts.push({ tab, ids });
      log(tab, 'create-post', { status: res.status(), ids });
    } else if (method === 'DELETE' && u.includes('/attachments')) {
      log(tab, 'delete-req', { status: res.status(), url: u.slice(0, 200) });
    } else if (method === 'PUT' || method === 'PATCH') {
      if (u.includes('/attachments/')) log(tab, 'update-req', { status: res.status(), url: u.slice(-60) });
    }
  });
}

const shot = async (page, name) => { await page.screenshot({ path: join(SHOTS, `${name}.png`) }); };

async function visibleRowNames(page) {
  return page.locator('.rdg-row span.truncate.font-medium').allTextContents();
}

async function pollFor(page, tab, what, predicate, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) {
      const ms = Date.now() - start;
      log(tab, 'assert-pass', { what, afterMs: ms });
      return { ok: true, ms };
    }
    await page.waitForTimeout(500);
  }
  log(tab, 'assert-fail', { what, afterMs: timeoutMs });
  return { ok: false, ms: timeoutMs };
}

async function deleteRowInTab(page, tab, name) {
  const row = rowByName(page, name).first();
  await row.locator('[aria-label="Select"]').click();
  await page.getByRole('button', { name: /delete/i }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: /^delete$/i }).click();
  log(tab, 'action', { did: 'delete', name });
}

// The grid's edit mode on the description cell opens the sheet that holds the collaborative editor.
async function openDescriptionEditor(page, name) {
  const headers = await page.locator('[role="columnheader"]').allTextContents();
  const column = headers.findIndex((h) => /description/i.test(h));
  if (column < 0) throw new Error(`no description column in ${JSON.stringify(headers)}`);
  await rowByName(page, name).first().locator('[role="gridcell"][aria-colindex]').nth(column).dblclick();
  const sheet = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: exactText(name) }) }).last();
  const editor = sheet.locator('.bn-editor[contenteditable="true"]').first();
  await editor.waitFor({ timeout: 20_000 });
  return editor;
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await context.addCookies([COOKIE]);

const tabA = await context.newPage();
instrument(tabA, 'tabA');
const tabB = await context.newPage();
instrument(tabB, 'tabB');

try {
  // ── Setup: load both tabs ──────────────────────────────────────────────────
  log('harness', 'target', { url: URL_ATTACHMENTS, email: EMAIL, cookie: COOKIE.name });
  await tabA.goto(URL_ATTACHMENTS, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await tabA.locator('.rdg-row').first().waitFor({ timeout: 60_000 });
  log('tabA', 'loaded', { visibility: await tabA.evaluate(() => document.visibilityState) });

  await tabB.goto(URL_ATTACHMENTS, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await tabB.locator('.rdg-row').first().waitFor({ timeout: 60_000 });
  log('tabB', 'loaded', { visibility: await tabB.evaluate(() => document.visibilityState) });
  await tabA.waitForTimeout(3000); // let catchup/SSE settle

  const namesA = await visibleRowNames(tabA);
  const namesB = await visibleRowNames(tabB);
  log('both', 'initial-rows', { tabA: namesA.slice(0, 6), tabB: namesB.slice(0, 6) });
  const shared = namesA.filter((n) => namesB.includes(n));
  if (shared.length < 3) throw new Error('need >=3 rows visible in both tabs');
  const [renameTarget, preseededDeleteTarget, descriptionTarget] = shared;
  await shot(tabA, '00-initial-tabA');
  await shot(tabB, '00-initial-tabB');

  // ── Experiment 1: RENAME control ──────────────────────────────────────────
  const newName = `renamed-probe-${Date.now().toString(36)}`;
  {
    const row = rowByName(tabA, renameTarget).first();
    await row.locator('span.truncate.font-medium').dblclick();
    const editor = tabA.locator('input[data-slot="edit-cell-input"]');
    await editor.waitFor({ timeout: 5000 });
    await editor.fill(newName);
    await editor.press('Enter');
    log('tabA', 'action', { did: 'rename', from: renameTarget, to: newName });
    await pollFor(tabA, 'tabA', 'rename visible in acting tab', async () => (await rowByName(tabA, newName).count()) > 0, 5000);
    const r = await pollFor(tabB, 'tabB', `EXP1 rename "${newName}" appears in observer tab`, async () => (await rowByName(tabB, newName).count()) > 0, 15_000);
    await shot(tabB, `01-rename-tabB-${r.ok ? 'PASS' : 'FAIL'}`);
  }

  // ── Experiment 2: CREATE (upload) ─────────────────────────────────────────
  // Tiny pdf (avoids Uppy image-editor plugins); unique filename => unique attachment name
  const probeName = `sync-probe-${Date.now().toString(36)}`;
  const pdfPath = join(OUT, `${probeName}.pdf`);
  writeFileSync(pdfPath, `%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Size 4/Root 1 0 R>>\n%%EOF\n`);
  let createOk = false;
  try {
    // NOT /upload/i: that also matches the org page-header "Upload cover" button
    await tabA.getByRole('button', { name: 'Upload', exact: true }).click();
    const dlg = tabA.getByRole('dialog').filter({ has: tabA.locator('.uppy-Dashboard') });
    await dlg.waitFor({ timeout: 10_000 });
    await dlg.locator('input[type="file"]').first().setInputFiles(pdfPath);
    const proceed = dlg.locator('.uppy-StatusBar-actionBtn--upload');
    try { await proceed.click({ timeout: 8000 }); } catch { log('tabA', 'note', { text: 'no uppy proceed button (autoProceed?)' }); }
    log('tabA', 'action', { did: 'upload', file: `${probeName}.pdf` });
    await pollFor(tabA, 'tabA', 'create POST fired', async () => createPosts.length > 0, 20_000);
    createOk = (await pollFor(tabA, 'tabA', 'created row visible in acting tab', async () => (await rowByName(tabA, probeName).count()) > 0, 15_000)).ok;
    await shot(tabA, '02-create-tabA');
    const r = await pollFor(tabB, 'tabB', `EXP2 created row "${probeName}" appears LIVE in observer tab`, async () => (await rowByName(tabB, probeName).count()) > 0, 35_000);
    await shot(tabB, `02-create-tabB-${r.ok ? 'PASS' : 'FAIL'}`);
  } catch (err) {
    log('tabA', 'exp2-error', { message: String(err).slice(0, 300) });
    await shot(tabA, '02-create-tabA-ERROR');
  }

  // ── Experiment 3: DELETE the fresh row (never rendered in tab B) ──────────
  if (createOk) {
    try {
      await deleteRowInTab(tabA, 'tabA', probeName);
      await pollFor(tabA, 'tabA', 'fresh row gone in acting tab', async () => (await rowByName(tabA, probeName).count()) === 0, 5000);
      // tab B never showed it; watch whether a tombstone delta fetch still happens
      await tabB.waitForTimeout(8000);
      log('tabB', 'exp3-note', { text: 'window closed; check delta-fetch entries above for tombstone of fresh row' });
      await shot(tabB, '03-delete-fresh-tabB');
    } catch (err) {
      log('tabA', 'exp3-error', { message: String(err).slice(0, 300) });
    }
  } else {
    log('harness', 'exp3-skipped', { reason: 'create did not complete' });
  }

  // ── Experiment 4: DELETE a pre-seeded row (present in both tabs) ──────────
  try {
    await deleteRowInTab(tabA, 'tabA', preseededDeleteTarget);
    await pollFor(tabA, 'tabA', 'preseeded row gone in acting tab', async () => (await rowByName(tabA, preseededDeleteTarget).count()) === 0, 5000);
    const r = await pollFor(tabB, 'tabB', `EXP4 pre-seeded row "${preseededDeleteTarget}" disappears in observer tab`, async () => (await rowByName(tabB, preseededDeleteTarget).count()) === 0, 15_000);
    await shot(tabB, `04-delete-preseeded-tabB-${r.ok ? 'PASS' : 'FAIL'}`);
  } catch (err) {
    log('tabA', 'exp4-error', { message: String(err).slice(0, 300) });
  }

  // ── Experiment 5: DESCRIPTION (typing over the relay, then the saved row) ──
  const marker = `desc-probe-${Date.now().toString(36)}`;
  watchedText = marker;
  try {
    const editorA = await openDescriptionEditor(tabA, descriptionTarget);
    const editorB = await openDescriptionEditor(tabB, descriptionTarget);
    await caretToEnd(tabA, editorA);
    await tabA.keyboard.type(` ${marker}`, { delay: 20 });
    log('tabA', 'action', { did: 'type-description', row: descriptionTarget, marker });
    const live = await pollFor(tabB, 'tabB', `EXP5 typed "${marker}" appears LIVE in observer tab's editor`, async () => (await editorText(editorB)).includes(marker), 10_000);
    await shot(tabB, `05-description-live-tabB-${live.ok ? 'PASS' : 'FAIL'}`);
    await tabA.keyboard.press('Escape');
    await tabB.keyboard.press('Escape');
    // The relay saves the row after a quiet window (3s, at most 10s); the saved row then travels the entity path like a rename.
    // The table cell is no proof: the tab's own editor already patched it.
    const savedRowFetched = () => evidence.some((e) => e.tab === 'tabB' && e.kind === 'delta-fetch' && e.detail.items?.some((i) => i.hasWatchedText));
    const saved = await pollFor(tabB, 'tabB', 'EXP5 saved row with the typed text reaches observer tab (delta fetch)', async () => savedRowFetched(), 25_000);
    await shot(tabB, `05-description-saved-tabB-${saved.ok ? 'PASS' : 'FAIL'}`);
  } catch (err) {
    log('tabA', 'exp5-error', { message: String(err).slice(0, 300) });
    await shot(tabA, '05-description-tabA-ERROR');
  }

  // ── Experiment 6: reload observer tab, server-state truth ─────────────────
  {
    await tabB.reload({ waitUntil: 'domcontentloaded' });
    await tabB.locator('.rdg-row').first().waitFor({ timeout: 30_000 });
    await tabB.waitForTimeout(2000);
    const names = await visibleRowNames(tabB);
    log('tabB', 'exp6-after-reload', {
      renamedVisible: names.includes(newName),
      freshCreatedThenDeletedVisible: names.includes(probeName),
      preseededDeletedVisible: names.includes(preseededDeleteTarget),
      descriptionSaved: (await rowByName(tabB, descriptionTarget).filter({ hasText: marker }).count()) > 0,
      top: names.slice(0, 6),
    });
    await shot(tabB, '06-reload-tabB');
  }
} catch (err) {
  log('harness', 'error', { message: String(err).slice(0, 800) });
  try { await shot(tabA, '99-error-tabA'); await shot(tabB, '99-error-tabB'); } catch {}
} finally {
  writeFileSync(join(OUT, 'evidence.json'), JSON.stringify(evidence, null, 1));
  await browser.close();
  console.log(`\nEvidence: ${evidence.length} entries -> ${join(OUT, 'evidence.json')}`);
}
