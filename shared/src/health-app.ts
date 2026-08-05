import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';

interface HealthAppOptions {
  /** Release identifier reported in the `X-App-Version` header on every response. */
  version: string;
  /** Full-depth diagnostics: HTTP status (200 or 503) plus the JSON body. */
  full: () => Promise<{ httpStatus: number; body: unknown }> | { httpStatus: number; body: unknown };
}

/**
 * Health endpoint shared by backend, cdc and yjs, implementing the contract the load
 * balancer and infra deploy verification (`wait-for-version`) consume: shallow
 * `GET /health` → 204, `?depth=full` → JSON diagnostics with the callback's status,
 * both carrying `X-App-Version` and short-lived caching. Workers serve the returned
 * app directly; the backend mounts it into its route tree.
 */
export const createHealthApp = ({ version, full }: HealthAppOptions): Hono => {
  const app = new Hono();

  // Scoped to the health path so mounting into a larger app (backend) leaves its
  // global secure-headers configuration untouched on every other route.
  app.use(
    '/health',
    secureHeaders({
      referrerPolicy: 'strict-origin-when-cross-origin',
      strictTransportSecurity: 'max-age=31536000; includeSubDomains; preload',
    }),
  );

  app.get('/health', async (c) => {
    c.header('X-App-Version', version);
    c.header('Cache-Control', 'public, max-age=5');

    if (c.req.query('depth') !== 'full') return c.body(null, 204);

    const { httpStatus, body } = await full();
    return c.json(body, httpStatus as 200);
  });

  app.notFound((c) => c.body(null, 404));

  return app;
};
