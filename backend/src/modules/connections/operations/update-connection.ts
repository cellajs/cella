import type { z } from '@hono/zod-openapi';
import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { updateStamps } from '#/db/utils/stamps';
import { withActorRef } from '#/modules/actors/actor-refs';
import { findConnectionById, updateConnection } from '#/modules/connections/connections-queries';
import type { updateConnectionBodySchema } from '#/modules/connections/connections-schema';
import { assertClaimValuesFree } from '#/modules/connections/operations/assert-claim-values-free';

type UpdateConnectionInput = z.infer<typeof updateConnectionBodySchema>;

/**
 * Changes a tenant's connection: name, domains, IdP entity ids, status, provisioning. The federation stays what it was.
 * @throws AppError 404 `not_found`, 409 `resource_already_exists` when a new domain is accepted by another connection.
 */
export async function updateConnectionOp(ctx: UserContext, id: string, input: UpdateConnectionInput) {
  const existing = await findConnectionById(ctx, { id, tenantId: ctx.var.tenantId });
  if (!existing) throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'connection' } });

  const { displayName, claimValues, idpEntityIds, status, jitProvisioning, logoUrl } = input;

  if (claimValues) await assertClaimValuesFree(ctx, { issuer: existing.issuer, claimValues, excludeId: existing.id });

  const config =
    idpEntityIds || logoUrl !== undefined
      ? { ...existing.config, ...(idpEntityIds ? { idpEntityIds } : {}), ...(logoUrl ? { logoUrl } : {}) }
      : undefined;

  const updated = await updateConnection(ctx, {
    id: existing.id,
    tenantId: ctx.var.tenantId,
    values: { displayName, claimValues, status, jitProvisioning, config, ...updateStamps(ctx.var.actor.id) },
  });
  return withActorRef(ctx, updated);
}
