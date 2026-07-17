import { AppError } from '#/core/error';
import { xMiddleware } from '#/core/x-middleware';

/**
 * In-memory per-tenant concurrency lock for entity creation.
 *
 * Prevents concurrent insert requests for the same tenant from racing
 * past quota checks. When an insert is already in-flight for a given tenant,
 * subsequent requests receive a 409 Conflict without queuing.
 *
 * Scoped by `tenantId`: a normal user only works in one tenant at a time,
 * so this effectively serializes their create requests without being too
 * granular. The lock is held only for the duration of the request handler
 * and auto-releases on completion or error.
 *
 * Single-process only: with multiple backend instances the worst-case
 * overshoot is bounded to one batch per instance, which is acceptable
 * given quotas are soft business guardrails.
 */
const inflightInserts = new Map<string, Promise<void>>();

export const insertEntityLock = xMiddleware(
  {
    functionName: 'insertEntityLock',
    type: 'x-rate-limiter',
    name: 'insertEntityLock',
    description: 'Prevents concurrent entity creation for the same tenant',
  },
  async (ctx, next) => {
    const tenantId = ctx.var.tenantId;

    // Skip lock if no tenant context
    if (!tenantId) {
      await next();
      return;
    }

    // If an insert is already in-flight for this tenant, reject immediately
    if (inflightInserts.has(tenantId)) {
      throw new AppError(409, 'insert_in_progress', 'info');
    }

    // Acquire lock via a deferred promise
    let releaseLock: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    inflightInserts.set(tenantId, lockPromise);

    try {
      await next();
    } finally {
      inflightInserts.delete(tenantId);
      releaseLock!();
    }
  },
);
