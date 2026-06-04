import { appConfig } from '../config-builder/app-config';

/**
 * Wait for the backend health endpoint to be available.
 * Used by workers (cdc, yjs) to delay startup until the backend is ready.
 */
export async function waitForBackend(interval = 1000, timeout = 60000): Promise<void> {
  const healthUrl = `${appConfig.backendUrl}/health`;
  const start = Date.now();

  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(healthUrl, { method: 'HEAD', signal: AbortSignal.timeout(2000) });
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, interval));
  }

  throw new Error(`Backend not ready after ${timeout}ms`);
}
