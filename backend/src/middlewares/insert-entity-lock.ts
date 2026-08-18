import { AppError } from '#/core/error';
import { xMiddleware } from '#/core/x-middleware';

/**
 * Rejects concurrent creates for one tenant so they cannot race past quota checks. The lock is request-scoped and
 * process-local, bounding multi-instance quota overshoot to one batch per instance.
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

    if (!tenantId) {
      await next();
      return;
    }

    if (inflightInserts.has(tenantId)) {
      throw new AppError(409, 'insert_in_progress', 'info');
    }

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
