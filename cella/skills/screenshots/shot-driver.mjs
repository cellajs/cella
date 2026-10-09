// Shoots this app's marketing screenshots, a matched light/dark pair each. Shot list: shots-config.mjs. See SKILL.md.
// Usage, from the app's repo root, where START= attaches to a running stack and OUT_DIR keeps a trial run out of it:
//   [START='pnpm dev'] [EMAIL=<admin email>] [OUT_DIR=<dir>] node cella/skills/screenshots/shot-driver.mjs [<id> ...]
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { chromium, mintSession } from '../two-tab-sync-test/driver-lib.mjs';
import * as config from './shots-config.mjs';

// A namespace import, so a shots-config.mjs written before an export existed still loads
const { devices, placeholders, shots, suppress, format = 'png' } = config;

const START = process.env.START ?? 'pnpm dev';
const OUT_DIR = process.env.OUT_DIR || null;
const LOG_DIR = process.env.LOG_DIR ?? '/tmp/cella-shots';
const fileEnv = parseEnv(readFileSync('backend/.env', 'utf8'));
// The environment wins over the file, as it does for the stack itself: a run against another database names its admin there
const EMAIL = process.env.EMAIL ?? process.env.ADMIN_EMAIL ?? fileEnv.ADMIN_EMAIL;
if (!EMAIL) throw new Error('No admin email: set EMAIL, or ADMIN_EMAIL in backend/.env.');

const wanted = process.argv.slice(2);
const unknown = wanted.filter((id) => !shots.some((shot) => shot.id === id));
if (unknown.length) throw new Error(`No such shot: ${unknown.join(', ')}. This app shoots: ${shots.map((shot) => shot.id).join(', ')}`);
const todo = wanted.length ? shots.filter((shot) => wanted.includes(shot.id)) : shots;

if (format !== 'png' && format !== 'webp') throw new Error(`No such format "${format}" in shots-config.mjs: it is 'png' or 'webp'.`);
// Asked before the stack boots: a missing encoder is known in a second, not after the last shot
if (format === 'webp' && spawnSync('cwebp', ['-version']).status !== 0)
  throw new Error("format 'webp' needs the cwebp encoder on the PATH: `brew install webp` or `apt install webp`. Or set format to 'png'.");

const BOOT_MS = 5 * 60_000;
// The first signed-in page of a dev server compiles most of the app on demand
const PAGE_MS = 120_000;
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const answers = (url, accept) =>
  fetch(url).then(
    (response) => accept(response.status),
    () => false,
  );

/**
 * Resolves once the page has stopped adding or changing content for `quiet` ms, or after `cap` ms. Ported from
 * `settle` in a11y/src/session.ts (the network never goes idle in development): keep the two in step.
 */
async function settle(page, quiet = 400, cap = 5000) {
  const waited = page.evaluate(
    ([quietMs, capMs]) =>
      new Promise((resolve) => {
        const done = () => {
          observer.disconnect();
          clearTimeout(timer);
          clearTimeout(limit);
          resolve();
        };
        let timer = setTimeout(done, quietMs);
        const limit = setTimeout(done, capMs);
        const observer = new MutationObserver(() => {
          clearTimeout(timer);
          timer = setTimeout(done, quietMs);
        });
        observer.observe(document, { subtree: true, childList: true, characterData: true });
      }),
    [quiet, cap],
  );
  // A navigation during the wait tears down the page's script context
  await waited.catch(() => page.waitForTimeout(quiet));
}

/**
 * Writes the color mode and the one-time UI into the app's persisted ui store before any page script runs, so the
 * first paint is already in the right mode: `themer.tsx` turns `mode` into the `.light` / `.dark` class on `<html>`.
 * The entry is merged, never replaced, so the brand theme and anything else the store holds survives.
 */
function seedUiState(context, slug, mode) {
  return context.addInitScript(
    ([key, wantedMode, alerts, hints]) => {
      const stored = JSON.parse(localStorage.getItem(key) ?? '{}');
      const state = { ...stored.state, mode: wantedMode };
      state.publicAlertsSeen = [...new Set([...(state.publicAlertsSeen ?? []), ...alerts])];
      state.hintsSeen = [...new Set([...(state.hintsSeen ?? []), ...hints])];
      // A fresh entry needs the store's own version, or zustand drops it as written by an older build
      localStorage.setItem(key, JSON.stringify({ version: 1, ...stored, state }));
    },
    [`${slug}-ui`, mode, suppress?.alerts ?? [], suppress?.hints ?? []],
  );
}

const t0 = Date.now();
const log = (kind, detail) => console.log(`+${String(Date.now() - t0).padStart(6)}ms ${kind}: ${JSON.stringify(detail).slice(0, 300)}`);

// The session is a database row, so the stack need not run yet; the mint output names the API URL and so the app origin
const session = mintSession(EMAIL);
const { base, api } = session;
// The ui store's key is `<slug>-ui`, and the session cookie is `[__Host-]<slug>-session-v<n>`: one app config, read
// off the mint output, so an app with its own slug needs no configuration here
const slug = session.cookie.name.replace(/^__Host-/, '').replace(/-session-v\d+$/, '');
log('target', { base, api, email: EMAIL, start: START || '(attached)', out: OUT_DIR ?? '(the files the app ships)' });

let stack = null;
mkdirSync(LOG_DIR, { recursive: true });
const logPath = join(LOG_DIR, 'dev-stack.log');
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

/**
 * Writes a screenshot to `path` in the app's format. WebP is lossless, so the pixels are the screenshot's own, at the
 * encoder's slowest and smallest setting: a third of the PNG for a page of flat color and text.
 */
function writeShot(png, path) {
  if (format === 'png') {
    writeFileSync(path, png);
    return;
  }
  const source = join(scratch, 'shot.png');
  writeFileSync(source, png);
  const encoded = spawnSync('cwebp', ['-quiet', '-lossless', '-z', '9', source, '-o', path], { encoding: 'utf8' });
  if (encoded.status !== 0) throw new Error(`cwebp could not write ${path}: ${encoded.stderr.trim()}`);
}

const written = [];
const failures = [];
const scratch = mkdtempSync(join(tmpdir(), 'shots-'));
let browser = null;

try {
  if (START) {
    if (await answers(base, (status) => status < 500)) throw new Error(`Something already answers at ${base}. Stop it, or run with START= to shoot that stack.`);
    const [command, ...args] = START.split(/\s+/);
    stack = spawn(command, args, { detached: true, stdio: ['ignore', openSync(logPath, 'w'), openSync(logPath, 'a')] });
    log('stack', { command: START, pid: stack.pid, log: logPath });
  }

  const deadline = Date.now() + BOOT_MS;
  while (!((await answers(base, (status) => status < 500)) && (await answers(`${api}/health`, (status) => status < 300)))) {
    if (stack && stack.exitCode !== null) throw new Error(`The stack stopped while starting (exit ${stack.exitCode}): see ${logPath}`);
    if (Date.now() > deadline) throw new Error(`Nothing answered at ${base} and ${api}/health within ${BOOT_MS / 60_000} minutes${stack ? `: see ${logPath}` : '.'}`);
    await sleep(2000);
  }
  log('up', { base, api });

  const cookie = `${session.cookie.name}=${session.cookie.value}`;
  const call = async (path, init) => {
    const headers = init ? { cookie, 'content-type': 'application/json' } : { cookie };
    const response = await fetch(`${api}${path}`, { method: init?.method, headers, body: init && JSON.stringify(init.body) });
    if (!response.ok) throw new Error(`${init?.method ?? 'GET'} ${path} answered ${response.status}`);
    return response.json();
  };

  // A freshly seeded user has not finished onboarding, and /home then redirects to the welcome page
  const { user } = await call('/me');
  if (!user?.id) throw new Error(`No user for ${EMAIL}: seed the database, or name another admin with EMAIL=.`);
  if (!user.userFlags?.finishedOnboarding) await call('/me', { method: 'PUT', body: { userFlags: { finishedOnboarding: true } } });

  const values = {};
  for (const [name, resolve] of Object.entries(placeholders ?? {})) values[name] = await resolve(call);
  const resolvePath = (path) =>
    path.replace(/\{(\w+)\}/g, (_, name) => {
      const value = values[name];
      if (!value) throw new Error(`No value for {${name}}: its resolver in shots-config.mjs found nothing for ${EMAIL}.`);
      return value;
    });

  browser = await chromium.launch();

  // One context per device and mode: the ui store lives in the context, so it is written once and every shot in the
  // group inherits it. A pair is the same recipe run twice, which is what keeps the light and dark shot in register.
  for (const deviceName of [...new Set(todo.map((shot) => shot.device))]) {
    const device = devices[deviceName];
    if (!device) throw new Error(`No device "${deviceName}" in shots-config.mjs: it has ${Object.keys(devices).join(', ')}.`);

    for (const mode of ['light', 'dark']) {
      const context = await browser.newContext({
        viewport: { width: device.width, height: device.height },
        deviceScaleFactor: device.scale,
        colorScheme: mode,
        reducedMotion: 'reduce',
        serviceWorkers: 'block',
        locale: 'en-US',
        timezoneId: 'Europe/Amsterdam',
      });
      await context.addCookies([session.cookie]);
      await seedUiState(context, slug, mode);

      for (const shot of todo.filter((entry) => entry.device === deviceName)) {
        const target = OUT_DIR ? join(OUT_DIR, basename(shot.out)) : resolve(shot.out);
        const path = `${target}${mode === 'dark' ? '-dark' : ''}.${format}`;
        const page = await context.newPage();
        try {
          await page.goto(`${base}${resolvePath(shot.path)}`, { waitUntil: 'domcontentloaded', timeout: PAGE_MS });
          await page.locator('main').first().waitFor({ timeout: PAGE_MS });
          await settle(page);
          await shot.open?.(page);
          await settle(page);
          // A click in `open` leaves the control focused and the pointer over it: neither belongs in a marketing shot.
          // The pointer parks in the top right corner, which is page header or background in every layout here; the
          // bottom corners are a table row and the sidebar, and both take a hover style.
          await page.mouse.move(device.width - 1, 0);
          await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
          await settle(page, 200, 1000);

          mkdirSync(dirname(path), { recursive: true });
          writeShot(await page.screenshot({ animations: 'disabled', caret: 'hide', scale: 'device' }), path);
          written.push({ id: shot.id, mode, path, bytes: statSync(path).size, pixels: `${device.width * device.scale}x${device.height * device.scale}` });
          log('shot', { id: shot.id, mode });
        } catch (error) {
          failures.push({ id: shot.id, mode, error: error instanceof Error ? error.message : String(error) });
          log('failed', { id: shot.id, mode, error: String(error).slice(0, 200) });
        } finally {
          await page.close();
        }
      }
      await context.close();
    }
  }
} catch (error) {
  failures.push({ id: '(run)', mode: '-', error: error instanceof Error ? error.message : String(error) });
} finally {
  await browser?.close();
  stop();
  rmSync(scratch, { recursive: true, force: true });

  console.log(`\n${written.length} image${written.length === 1 ? '' : 's'}:`);
  for (const image of written) console.log(`  ${image.id.padEnd(20)} ${image.mode.padEnd(5)} ${image.pixels.padEnd(10)} ${String(Math.round(image.bytes / 1024)).padStart(5)} KB  ${image.path}`);
  for (const failure of failures) console.log(`  FAILED ${failure.id} ${failure.mode}: ${failure.error}`);
  console.log('\nNow look at every image against the rubric in SKILL.md, and re-shoot by id what does not pass.');
  process.exitCode = failures.length ? 1 : 0;
}
