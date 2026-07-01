/**
 * Start Storybook with a port derived from appConfig.
 * Port = frontend port + 3006 (e.g., 3000→6006, 3010→6016).
 * This ensures each fork gets its own Storybook port automatically.
 *
 * Idempotent: if a server is already listening on the target port
 * (e.g. `pnpm story` is running, or a previous test run left one up),
 * we exit successfully instead of failing with EADDRINUSE. This lets
 * `pnpm test` / `pnpm test:full` reuse an existing Storybook server.
 */
import { execSync } from 'node:child_process';
import net from 'node:net';
import { appConfig } from '../../shared';

const port = Number(new URL(appConfig.frontendUrl).port) + 3006;

/**
 * Ensure the Playwright browsers used by the Storybook Vitest addon are present.
 * Playwright pins an exact browser build; when the `playwright` dependency is
 * bumped it expects a newer build than what's cached on disk, which makes the
 * addon fail with "Executable doesn't exist". `playwright install` is idempotent
 * and does nothing (no download) when the correct build is already installed, so
 * this is cheap on every run. We do this here instead of a `postinstall` hook to
 * avoid tripping supply-chain scanners and to survive `pnpm install --ignore-scripts`.
 */
function ensurePlaywrightBrowsers() {
  try {
    execSync('playwright install chromium chromium-headless-shell', { stdio: 'inherit' });
  } catch {
    console.warn('[storybook] Could not verify Playwright browsers. Run `pnpm --filter frontend exec playwright install` if browser tests fail.');
  }
}

ensurePlaywrightBrowsers();

function isPortInUse(p: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const done = (inUse: boolean) => {
      socket.destroy();
      resolve(inUse);
    };
    socket.setTimeout(500);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
    socket.connect(p, host);
  });
}

const inUse = await isPortInUse(port);
if (inUse) {
  console.log(`[storybook] Port ${port} already in use — reusing existing Storybook server.`);
  process.exit(0);
}

execSync(`cross-env STORYBOOK=true storybook dev -p ${port} --quiet --no-open`, {
  stdio: 'inherit',
  env: { ...process.env, STORYBOOK: 'true' },
});
