import { AppError } from '#/core/error';
import { xMiddleware } from '#/core/x-middleware';

/** Tenants with a create in flight in this process. */
const inflightInserts = new Set<string>();

/**
 * Rejects concurrent creates for one tenant so they cannot race past quota checks. The lock is request-scoped and
 * process-local, bounding multi-instance quota overshoot to one batch per instance.
 */
export const insertEntityLock = xMiddleware(
  {
    functionName: 'insertEntityLock',
    type: 'x-rate-limiter',
    errors: [409],
    name: 'Create lock',
    description: 'One create at a time for each tenant. A second one during that time gets a 409.',
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

    inflightInserts.add(tenantId);
    try {
      await next();
    } finally {
      inflightInserts.delete(tenantId);
    }
  },
);
