import { createMiddleware } from 'hono/factory';
import type { Env } from '#/core/context';
import { clientSchemaVersionSeen } from '#/lib/schema-version-metrics';

/**
 * Records the client's schema version (X-Client-Version header) into an otel
 * counter. Missing or
 * malformed headers are bucketed as `unknown`.
 */
export const clientVersionMiddleware = createMiddleware<Env>(async (c, next) => {
  const raw = c.req.header('x-client-version');
  const version = raw !== undefined && /^\d+$/.test(raw) ? raw : 'unknown';
  clientSchemaVersionSeen.add(1, { version });
  return next();
});
