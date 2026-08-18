import { appConfig } from '../config-builder/app-config.ts';
import { sleep } from './sleep.ts';

/**
 * Delays cdc and yjs startup until the backend answers. In development and test, backendUrl
 * points at the Vite dev server, which may not be up when a worker boots, so this probes the
 * backend's own `devPorts` port.
 */
export async function waitForBackend(interval = 2000, timeout = 60000): Promise<void> {
  const isLocal = appConfig.mode === 'development' || appConfig.mode === 'test';
  const healthUrl = isLocal ? `http://localhost:${appConfig.devPorts.api}/health` : `${appConfig.backendUrl}/health`;
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
