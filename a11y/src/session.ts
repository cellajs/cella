import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { type Browser, type BrowserContext, type BrowserContextOptions, chromium, type Page } from 'playwright';
import { appConfig } from 'shared';
import { placeholders, prepare } from '../scope-config.ts';
import type { AuditApi } from './scope.ts';

export const repoRoot = path.resolve(import.meta.dirname, '../..');
export const baseUrl = appConfig.frontendUrl;

export type Mode = 'light' | 'dark';

type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>;

export interface Session {
  browser: Browser;
  /** Cookies and local storage of a browser that has loaded the app once, as after a real sign-in. */
  storage: StorageState | null;
  /** Resolved `{name}` placeholders of the scope paths. */
  values: Record<string, string | null>;
}

/** Elements that exist only in development builds; scans and probes ignore them. */
export const devOnlySelectors = ['.TanStackRouterDevtools', '.tsqd-parent-container', '[aria-label="toggle debug toolbar"]'];

/** Signs in through the backend's session mint script, which refuses outside development and test. */
function mintCookie(email: string) {
  const result = spawnSync('pnpm', ['--silent', '--filter', 'backend', 'session:mint', email, '4'], { cwd: repoRoot, encoding: 'utf8' });
  const match = /^([\w-]+-session-v\d+)=(\S+)$/m.exec(result.stdout);
  if (!match) throw new Error(`Could not mint a session for ${email}:\n${result.stdout}\n${result.stderr}`);
  return { name: match[1], value: match[2] };
}

/** Starts the browser and, when an email is given, a session plus the values of the scope's path placeholders. */
export async function startSession(email: string | null): Promise<Session> {
  const browser = await chromium.launch();
  if (!email) return { browser, storage: null, values: {} };

  const cookie = mintCookie(email);
  const api: AuditApi = async (apiPath, init) => {
    const headers = { cookie: `${cookie.name}=${cookie.value}`, ...(init && { 'content-type': 'application/json' }) };
    const response = await fetch(`${appConfig.backendUrl}${apiPath}`, { method: init?.method, headers, body: init && JSON.stringify(init.body) });
    if (!response.ok) throw new Error(`${init?.method ?? 'GET'} ${apiPath} answered ${response.status}`);
    return response.json();
  };
  await prepare(api);
  const values: Session['values'] = {};
  for (const [name, resolve] of Object.entries(placeholders)) values[name] = await resolve(api);

  // Route guards read the user store, which a real sign-in fills before any deep link is opened
  const context = await browser.newContext();
  await context.addCookies([{ ...cookie, url: baseUrl }]);
  const page = await context.newPage();
  await page.goto(`${baseUrl}/home`, { waitUntil: 'domcontentloaded' });
  await page.locator('main').first().waitFor({ timeout: 60_000 });
  await settle(page);
  const storage = await context.storageState();
  await context.close();

  return { browser, storage, values };
}

interface ContextOptions {
  auth: boolean;
  mode: Mode;
}

/**
 * The audit measures the app with increased contrast turned on, which is what raises the edge tokens to 3:1.
 * It is a user setting, not the default, so every report built from this run has to say so: `auditContrast` is
 * written into the ledger and printed by the report for that reason. Set it to 'system' to audit the resting state.
 */
export const auditContrast: 'system' | 'more' = 'more';

export const defaultViewport = { width: 1280, height: 900 };

/**
 * A fresh browser context: theme preset, dev banner dismissed, signed in (with the stored session) when `auth` is set.
 * `overrides` change the browser settings for one check, such as the viewport or the motion preference.
 */
export async function newContext(session: Session, { auth, mode }: ContextOptions, overrides: BrowserContextOptions = {}) {
  if (auth && !session.storage) throw new Error('This state needs a signed-in session: pass --email or set ADMIN_EMAIL.');
  const storageState = auth ? (session.storage ?? undefined) : undefined;
  const context = await session.browser.newContext({
    viewport: defaultViewport,
    colorScheme: mode,
    // Emulates `prefers-contrast`, which tailwind.css answers on its own, so public pages are covered like signed-in ones
    contrast: auditContrast === 'more' ? 'more' : 'no-preference',
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
    storageState,
    ...overrides,
  });
  // `contrast` here is what the app's own `data-contrast` path reads; the context option above covers the media query
  const uiState = {
    state: { mode, theme: 'none', contrast: auditContrast, offlineAccess: false, publicAlertsSeen: ['test-credentials'] },
    version: 1,
  };
  // tsx keeps function names with an `__name` helper that does not exist in the page
  await context.addInitScript({ content: 'window.__name = (fn) => fn;' });
  await context.addInitScript(
    ([key, value]) => {
      window.localStorage.setItem(key, value);
    },
    [`${appConfig.slug}-ui`, JSON.stringify(uiState)],
  );
  return context;
}

/**
 * Resolves once the page has stopped adding or changing content for `quiet` ms, or after `cap` ms. Lazy sections,
 * query results and opening overlays all show up as DOM changes; the network never goes idle in development.
 */
export async function settle(page: Page, quiet = 400, cap = 3000) {
  const waited = page.evaluate(
    ([quietMs, capMs]) =>
      new Promise<void>((resolve) => {
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

/** Fills the `{name}` placeholders of a scope path. */
export function resolvePath(session: Session, statePath: string) {
  return statePath.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = session.values[name];
    if (!value) throw new Error(`No value for {${name}}: its resolver in a11y/scope-config.ts found nothing for the audit user.`);
    return value;
  });
}

/** Opens a path and waits until the route has rendered its main content. */
export async function openPage(context: BrowserContext, statePath: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`${baseUrl}${statePath}`, { waitUntil: 'domcontentloaded' });
  await page.locator('main, [role="main"], #accessibility-content, form, h1, footer').first().waitFor({ timeout: 30_000 });
  await settle(page);
  // A guard that redirects would make the audit judge another page under this state's name
  const landed = new URL(page.url()).pathname;
  const asked = new URL(statePath, baseUrl).pathname;
  if (landed !== asked) throw new Error(`${asked} redirected to ${landed}`);
  return page;
}
