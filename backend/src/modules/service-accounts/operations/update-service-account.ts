import { eq } from 'drizzle-orm';
import type { UserContext } from '#/core/context';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { requireManagedServiceAccount } from '#/modules/service-accounts/helpers/managed-service-account';
import { serviceAccountsTable } from '#/modules/service-accounts/service-accounts-db';
import type { UpdateServiceAccountInput } from '#/modules/service-accounts/service-accounts-schema';
import { getIsoDate } from '#/utils/iso-date';
import { log } from '#/utils/logger';

/**
 * Name and status. Accounts are disabled, never deleted, so provenance keeps pointing at them (D18). A change reaches
 * every process at once: the account's keys and tokens, and for an installed app its users' tokens in the tenant.
 */
export async function updateServiceAccountOp(ctx: UserContext, id: string, input: UpdateServiceAccountInput) {
  const account = await requireManagedServiceAccount(ctx, id);
  const [updated] = await ctx.var.db
    .update(serviceAccountsTable)
    .set({ ...input, updatedAt: getIsoDate(), updatedBy: ctx.var.actor.id })
    .where(eq(serviceAccountsTable.id, account.id))
    .returning();
  invalidateCache.serviceAccount(account.id);
  if (updated.oauthClientId) invalidateCache.installation(updated.tenantId, updated.oauthClientId);
  log.info('Service account updated', { serviceAccountId: id, status: updated.status });
  return updated;
}
