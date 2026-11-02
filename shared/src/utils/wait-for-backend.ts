import process from 'node:process';
import { appConfig } from '../config-builder/app-config.ts';
import { sleep } from './sleep.ts';

interface WaitForBackendOptions {
  /** Milliseconds between two probes. */
  interval?: number;
  /** Milliseconds of probing before it throws. */
  timeout?: number;
  apiPort?: number;
}

/**
 * Delays a worker's startup until the backend answers. On a local stack, backendUrl points at the Vite dev server or
 * the tunnel, which may not be up when a worker boots, so this probes the backend's own port. `apiPort` defaults to
 * `PORT` from the backend's .env, which the cdc and yjs workers load, else the backend's configured port. A worker
 * that sets `PORT` to its own port passes the API's.
 */
export async function waitForBackend({ interval = 2000, timeout = 60_000, apiPort }: WaitForBackendOptions = {}): Promise<void> {
  // biome-ignore lint/style/noProcessEnv: the API's PORT override, which the workers read from the backend's .env.
  const port = apiPort ?? (process.env.PORT || appConfig.services.backend.port);
  const healthUrl = appConfig.isLocal ? `http://localhost:${port}/health` : `${appConfig.backendUrl}/health`;
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
