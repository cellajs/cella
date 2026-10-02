import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { type Browser, type BrowserContext, chromium, type Page } from 'playwright';
import { appConfig } from 'shared';

export const repoRoot = path.resolve(import.meta.dirname, '../..');
export const baseUrl = appConfig.frontendUrl;

export type Mode = 'light' | 'dark';

type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>;

export interface Session {
  browser: Browser;
  /** Cookies and local storage of a browser that has loaded the app once, as after a real sign-in. */
  storage: StorageState | null;
  orgPath: string | null;
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

/** Starts the browser and, when an email is given, a session plus the path of that user's first organization. */
export async function startSession(email: string | null): Promise<Session> {
  const browser = await chromium.launch();
  if (!email) return { browser, storage: null, orgPath: null };

  const cookie = mintCookie(email);
  const response = await fetch(`${appConfig.backendUrl}/organizations?limit=1`, { headers: { cookie: `${cookie.name}=${cookie.value}` } });
  const { items } = (await response.json()) as { items: { tenantId: string; slug: string }[] };
  const org = items[0];

  // Route guards read the user store, which a real sign-in fills before any deep link is opened
  const context = await browser.newContext();
  await context.addCookies([{ ...cookie, url: baseUrl }]);
  const page = await context.newPage();
  await page.goto(`${baseUrl}/home`, { waitUntil: 'domcontentloaded' });
  await page.locator('main').first().waitFor({ timeout: 60_000 });
  await page.waitForTimeout(2000);
  const storage = await context.storageState();
  await context.close();

  return { browser, storage, orgPath: org ? `/${org.tenantId}/${org.slug}` : null };
}

interface ContextOptions {
  auth: boolean;
  mode: Mode;
  viewport?: { width: number; height: number };
  locale?: string;
}

/** A fresh browser context: theme preset, dev banner dismissed, signed in (with the stored session) when `auth` is set. */
export async function newContext(session: Session, { auth, mode, viewport = { width: 1280, height: 900 }, locale }: ContextOptions) {
  if (auth && !session.storage) throw new Error('This state needs a signed-in session: pass --email or set ADMIN_EMAIL.');
  const storageState = auth ? (session.storage ?? undefined) : undefined;
  const context = await session.browser.newContext({
    viewport,
    colorScheme: mode,
    reducedMotion: 'reduce',
    locale,
    serviceWorkers: 'block',
    storageState,
  });
  const uiState = { state: { mode, theme: 'none', offlineAccess: false, impersonating: false, publicAlertsSeen: ['test-credentials'] }, version: 1 };
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

/** Resolves `{org}` in a scope path. */
export function resolvePath(session: Session, statePath: string) {
  if (!statePath.includes('{org}')) return statePath;
  if (!session.orgPath) throw new Error('The audit user belongs to no organization, so organization states cannot run.');
  return statePath.replace('{org}', session.orgPath);
}

/** Opens a path and waits until the route has rendered its main content. */
export async function openPage(context: BrowserContext, statePath: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`${baseUrl}${statePath}`, { waitUntil: 'domcontentloaded' });
  await page.locator('main, [role="main"], #accessibility-content, form, h1, footer').first().waitFor({ timeout: 30_000 });
  // Lazy sections and queries settle after the first paint
  await page.waitForTimeout(1500);
  // A guard that redirects would make the audit judge another page under this state's name
  const landed = new URL(page.url()).pathname;
  const asked = new URL(statePath, baseUrl).pathname;
  if (landed !== asked) throw new Error(`${asked} redirected to ${landed}`);
  return page;
}
