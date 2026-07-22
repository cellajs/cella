import { execSync } from 'node:child_process';
import net from 'node:net';
import { appConfig } from '../../shared';

// Derive Storybook's port from appConfig so each fork gets a stable local port.
const port = Number(new URL(appConfig.frontendUrl).port) + 3006;

/**
 * Install Playwright's pinned Storybook browser idempotently at test startup.
 * Avoid postinstall so ignored scripts and supply-chain scanners do not disable setup.
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
  // Reuse an existing server so test commands can share a manually started Storybook.
  console.log(`[storybook] Port ${port} already in use — reusing existing Storybook server.`);
  process.exit(0);
}

execSync(`cross-env STORYBOOK=true storybook dev -p ${port} --quiet --no-open`, {
  stdio: 'inherit',
  env: { ...process.env, STORYBOOK: 'true' },
});
