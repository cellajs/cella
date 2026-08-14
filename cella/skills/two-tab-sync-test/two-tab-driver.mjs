// Two-tab realtime sync diagnosis for cella attachments. See SKILL.md for auth setup and the experiment matrix.
// Drives two signed-in tabs (shared session, real tab-coordinator semantics); captures per-tab console, seqCursor network bodies, SSE connections, screenshots.
// Usage: ORG_PATH=<tenantId>/<orgSlug> SESSION_COOKIE=<value> [OUT_DIR=...] node two-tab-driver.mjs
import { globSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Playwright lives in the pnpm store (frontend devDep), not resolvable by bare import from here.
// Run from the repo root so the glob resolves.
const [pwPath] = globSync('node_modules/.pnpm/playwright@*/node_modules/playwright/index.mjs').sort().reverse().map((p) => resolve(p));
const { chromium } = await import(pwPath);

const OUT = process.env.OUT_DIR ?? process.cwd();
const SHOTS = join(OUT, 'shots');
mkdirSync(SHOTS, { recursive: true });

const ORG_PATH = process.env.ORG_PATH ?? 'xbench/xbench-org';
const URL_ATTACHMENTS = `http://localhost:3000/${ORG_PATH}/organization/attachments`;
const COOKIE = {
  name: 'cella-development-session-v2',
  value: process.env.SESSION_COOKIE ?? 'e08a3f990277c545edfa77756948ae130da52f0e5059ba5c30538486499be388.00000000-0000-4000-a007-000000000000.',
  domain: 'localhost',
  path: '/',
  httpOnly: true,
  secure: false,
  sameSite: 'Strict',
};

const evidence = [];
const createPosts = [];
const t0 = Date.now();
const log = (tab, kind, detail) => {
  const entry = { ms: Date.now() - t0, tab, kind, detail };
  evidence.push(entry);
  if (kind !== 'console' || /CacheOps|handleEntity|handleApp|stream|sync|seq/i.test(String(detail?.text ?? ''))) {
    console.log(`+${String(entry.ms).padStart(6)}ms [${tab}] ${kind}: ${JSON.stringify(detail).slice(0, 400)}`);
  }
};

function instrument(page, tab) {
  page.on('console', (msg) => log(tab, 'console', { type: msg.type(), text: msg.text().slice(0, 500) }));
  page.on('pageerror', (err) => log(tab, 'pageerror', { message: String(err).slice(0, 500) }));
  page.on('request', (req) => {
    const u = req.url();
    if (u.includes('/entities/app/stream')) log(tab, 'sse-connect', { url: u });
  });
  page.on('response', async (res) => {
    const u = res.url();
    const method = res.request().method();
    if (u.includes('seqCursor')) {
      let items = null;
      try {
        const body = await res.json();
        items = (body.items ?? body.data?.items ?? []).map((i) => ({ id: i.id, name: i.name, deletedAt: i.deletedAt ?? null, seq: i.seq ?? null }));
      } catch { /* non-json */ }
      log(tab, 'delta-fetch', { status: res.status(), url: u.slice(u.indexOf('?')), items });
    } else if (method === 'POST' && /\/attachments$/.test(u.split('?')[0])) {
      let ids = null;
      try { const body = await res.json(); ids = (Array.isArray(body) ? body : body.items ?? [body]).map((i) => i?.id); } catch {}
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

const rowByName = (page, name) => page.locator('.rdg-row').filter({ hasText: name });

async function deleteRowInTab(page, tab, name) {
  const row = rowByName(page, name).first();
  await row.locator('[aria-label="Select"]').click();
  await page.getByRole('button', { name: /delete/i }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: /^delete$/i }).click();
  log(tab, 'action', { did: 'delete', name });
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
  if (shared.length < 2) throw new Error('need >=2 rows visible in both tabs');
  const renameTarget = shared[0];
  const preseededDeleteTarget = shared[1];
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

  // ── Experiment 5: reload observer tab, server-state truth ─────────────────
  {
    await tabB.reload({ waitUntil: 'domcontentloaded' });
    await tabB.locator('.rdg-row').first().waitFor({ timeout: 30_000 });
    await tabB.waitForTimeout(2000);
    const names = await visibleRowNames(tabB);
    log('tabB', 'exp5-after-reload', {
      renamedVisible: names.includes(newName),
      freshCreatedThenDeletedVisible: names.includes(probeName),
      preseededDeletedVisible: names.includes(preseededDeleteTarget),
      top: names.slice(0, 6),
    });
    await shot(tabB, '05-reload-tabB');
  }
} catch (err) {
  log('harness', 'error', { message: String(err).slice(0, 800) });
  try { await shot(tabA, '99-error-tabA'); await shot(tabB, '99-error-tabB'); } catch {}
} finally {
  writeFileSync(join(OUT, 'evidence.json'), JSON.stringify(evidence, null, 1));
  await browser.close();
  console.log(`\nEvidence: ${evidence.length} entries -> ${join(OUT, 'evidence.json')}`);
}
