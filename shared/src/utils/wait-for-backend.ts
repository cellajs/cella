import process from 'node:process';
import { appConfig } from '../config-builder/app-config.ts';
import { sleep } from './sleep.ts';

/**
 * Delays cdc and yjs startup until the backend answers. In development and test, backendUrl
 * points at the Vite dev server, which may not be up when a worker boots, so this probes the
 * backend's own port: `PORT` from the backend's .env, which every worker loads, else `devPorts.api`.
 * A stack on moved ports (a bench beside `pnpm dev`) so waits for its own API.
 */
export async function waitForBackend(interval = 2000, timeout = 60000): Promise<void> {
  const isLocal = appConfig.mode === 'development' || appConfig.mode === 'test';
  // biome-ignore lint/style/noProcessEnv: the API's PORT override, which the workers read from the backend's .env.
  const apiPort = process.env.PORT || appConfig.devPorts.api;
  const healthUrl = isLocal ? `http://localhost:${apiPort}/health` : `${appConfig.backendUrl}/health`;
  const start = Date.now();

  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(healthUrl, { method: 'HEAD', signal: AbortSignal.timeout(2000) });
      if (res.ok) return;
    } catch {}
    await sleep(interval);
  }

  throw new Error(`Backend not ready after ${timeout}ms`);
}
