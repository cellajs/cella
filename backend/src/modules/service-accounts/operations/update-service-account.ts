import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { updateStamps } from '#/db/utils/stamps';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { withActorRef } from '#/modules/actors/actor-refs';
import { requireStepUp } from '#/modules/auth/step-up/operations/read-step-up';
import { findServiceAccountInTenant, updateServiceAccount } from '#/modules/service-accounts/service-accounts-queries';
import type { UpdateServiceAccountInput } from '#/modules/service-accounts/service-accounts-schema';
import { getValidChannel } from '#/permissions';
import { log } from '#/utils/logger';

/**
 * Name and status. Accounts are disabled, never deleted, so provenance keeps pointing at them (D18). A change reaches
 * every process with the commit: the account's keys and tokens, and for an installed app its users' tokens in the tenant.
 * Re-enabling gives the account's keys their access back, so it asks the step-up a new key asks.
 */
export async function updateServiceAccountOp(ctx: UserContext, id: string, input: UpdateServiceAccountInput) {
  const { tenantId } = ctx.var;
  await getValidChannel(ctx, ctx.var.organizationId, 'organization', 'update');
  const account = await findServiceAccountInTenant(ctx, { id, tenantId });
  if (!account) throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'serviceAccount' } });
  if (input.status === 'active' && account.status !== 'active') await requireStepUp(ctx.var.session, 'factor');
  const updated = await updateServiceAccount(ctx, {
    id,
    tenantId,
    values: { ...input, ...updateStamps(ctx.var.actor.id) },
  });
  if (!updated) throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'serviceAccount' } });
  invalidateCache.serviceAccount(updated);
  log.info('Service account updated', { serviceAccountId: id, status: updated.status });
  return { ...(await withActorRef(ctx, updated)), lastSeenAt: account.lastSeenAt };
}
