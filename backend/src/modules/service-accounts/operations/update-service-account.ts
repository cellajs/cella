import { eq } from 'drizzle-orm';
import type { UserContext } from '#/core/context';
import { invalidateCredentialCacheByAccount } from '#/middlewares/guard/credential-cache';
import { invalidateClientCache } from '#/modules/oauth-server/adapter';
import { loadManagedServiceAccount } from '#/modules/service-accounts/helpers/managed-service-account';
import { serviceAccountsTable } from '#/modules/service-accounts/service-accounts-db';
import type { UpdateServiceAccountInput } from '#/modules/service-accounts/service-accounts-schema';
import { getIsoDate } from '#/utils/iso-date';
import { log } from '#/utils/logger';

/** Name, description and status. Accounts are disabled, never deleted, so provenance keeps pointing at them (D18). */
export async function updateServiceAccountOp(ctx: UserContext, id: string, input: UpdateServiceAccountInput) {
  const account = await loadManagedServiceAccount(ctx, id);
  const [updated] = await ctx.var.db
    .update(serviceAccountsTable)
    .set({ ...input, updatedAt: getIsoDate(), updatedBy: ctx.var.actor.id })
    .where(eq(serviceAccountsTable.id, account.id))
    .returning();
  invalidateCredentialCacheByAccount(account.id);
  invalidateClientCache(account.id);
  log.info('Service account updated', { serviceAccountId: id, status: updated.status });
  return updated;
}
