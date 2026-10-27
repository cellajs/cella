import { createMiddleware } from 'hono/factory';
import type { Env } from '#/core/context';
import { clientSchemaVersionSeen } from '#/lib/schema-version-metrics';

/** Counts the X-Client-Version header in an otel counter, bucketing missing and malformed values as `unknown`. */
export const clientVersionMiddleware = createMiddleware<Env>((ctx, next) => {
  const raw = ctx.req.header('x-client-version');
  const version = raw !== undefined && /^\d+$/.test(raw) ? raw : 'unknown';
  clientSchemaVersionSeen.add(1, { version });
  return next();
});
