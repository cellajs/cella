import { context } from '@opentelemetry/api';
import { suppressTracing } from '@opentelemetry/core';
import { appConfig } from '../config-builder/app-config.ts';
import { sleep } from './sleep.ts';

interface WaitForBackendOptions {
  /** Milliseconds between two probes. */
  interval?: number;
  /** Milliseconds of probing before it throws. */
  timeout?: number;
}

/**
 * Delays a worker's startup until the backend answers. On a local stack, backendUrl points at the Vite dev server or
 * the tunnel, which may not be up when a worker boots, so this probes the backend's own port.
 */
export async function waitForBackend({ interval = 2000, timeout = 60_000 }: WaitForBackendOptions = {}): Promise<void> {
  const healthUrl = appConfig.isLocal ? `http://localhost:${appConfig.services.backend.port}/health` : `${appConfig.backendUrl}/health`;
  const start = Date.now();

  while (Date.now() - start < timeout) {
    try {
      // The probe makes no span. Its refused connections are the expected wait, and their recorded exceptions would
      // reach the monitor as errors.
      const res = await context.with(suppressTracing(context.active()), () =>
        fetch(healthUrl, { method: 'HEAD', signal: AbortSignal.timeout(2000) }),
      );
      if (res.ok) return;
    } catch {}
    await sleep(interval);
  }

  throw new Error(`Backend not ready after ${timeout}ms`);
}
