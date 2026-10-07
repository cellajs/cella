import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { findServiceAccountInTenant, updateServiceAccount } from '#/modules/service-accounts/service-accounts-queries';
import type { UpdateServiceAccountInput } from '#/modules/service-accounts/service-accounts-schema';
import { getValidChannel } from '#/permissions';
import { getIsoDate } from '#/utils/iso-date';
import { log } from '#/utils/logger';

/**
 * Name and status. Accounts are disabled, never deleted, so provenance keeps pointing at them (D18). A change reaches
 * every process with the commit: the account's keys and tokens, and for an installed app its users' tokens in the tenant.
 */
export async function updateServiceAccountOp(ctx: UserContext, id: string, input: UpdateServiceAccountInput) {
  const { tenantId } = ctx.var;
  await getValidChannel(ctx, ctx.var.organizationId, 'organization', 'update');
  const account = await findServiceAccountInTenant(ctx, { id, tenantId });
  if (!account) throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'serviceAccount' } });
  const updated = await updateServiceAccount(ctx, {
    id,
    tenantId,
    values: { ...input, updatedAt: getIsoDate(), updatedBy: ctx.var.actor.id },
  });
  if (!updated) throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'serviceAccount' } });
  invalidateCache.serviceAccount(updated);
  log.info('Service account updated', { serviceAccountId: id, status: updated.status });
  return { ...updated, lastSeenAt: account.lastSeenAt };
}
