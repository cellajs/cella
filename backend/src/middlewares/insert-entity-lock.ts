import { AppError } from '#/core/error';
import { xMiddleware } from '#/core/x-middleware';

/**
 * Rejects concurrent creates for one tenant so they cannot race past quota checks.
 * The request-scoped lock always releases on completion. It is process-local, bounding
 * multi-instance quota overshoot to one batch per instance.
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
