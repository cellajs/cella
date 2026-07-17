import { appConfig } from '../config-builder/app-config';
import { sleep } from './sleep';

/**
 * Wait for the backend health endpoint to be available.
 * Used by workers (cdc, yjs) to delay startup until the backend is ready.
 *
 * In development/test, backendUrl points at the Vite dev server (same-origin proxy),
 * which may not be running when a worker boots. Probe the backend's own port directly.
 */
export async function waitForBackend(interval = 1000, timeout = 60000): Promise<void> {
  const isLocal = appConfig.mode === 'development' || appConfig.mode === 'test';
  const healthUrl = isLocal ? 'http://localhost:4000/health' : `${appConfig.backendUrl}/health`;
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
