import type { z } from '@hono/zod-openapi';
import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { findConnectionById, findConnectionsClaiming, updateConnection } from '#/modules/connections/connections-queries';
import type { updateConnectionBodySchema } from '#/modules/connections/connections-schema';

type UpdateConnectionInput = z.infer<typeof updateConnectionBodySchema>;

/**
 * Changes a tenant's connection: name, domains, IdP entity ids, status, provisioning. The federation stays what it was.
 * @throws AppError 404 `not_found`, 409 `resource_already_exists` when a new domain is accepted by another connection.
 */
export async function updateConnectionOp(ctx: UserContext, id: string, input: UpdateConnectionInput) {
  const existing = await findConnectionById(ctx, { id, tenantId: ctx.var.tenantId });
  if (!existing) throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'connection' } });

  const { displayName, claimValues, idpEntityIds, status, jitProvisioning, logoUrl } = input;

  if (claimValues) {
    const taken = await findConnectionsClaiming(ctx, { issuer: existing.issuer, claimValues, excludeId: existing.id });
    if (taken.length) throw new AppError(409, 'resource_already_exists', 'warn', { meta: { resource: 'connection', claimValues } });
  }

  const config =
    idpEntityIds || logoUrl !== undefined
      ? { ...existing.config, ...(idpEntityIds ? { idpEntityIds } : {}), ...(logoUrl ? { logoUrl } : {}) }
      : undefined;

  const updated = await updateConnection(ctx, {
    id: existing.id,
    tenantId: ctx.var.tenantId,
    values: { displayName, claimValues, status, jitProvisioning, config },
  });
  return updated;
}
