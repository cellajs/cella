import { eq } from 'drizzle-orm';
import type { UserContext } from '#/core/context';
import { serviceAccountsTable } from '#/modules/service-accounts/service-accounts-db';
import { findServiceAccountInTenant, requireOrgAdmin } from '#/modules/service-accounts/service-accounts-queries';
import type { UpdateServiceAccountInput } from '#/modules/service-accounts/service-accounts-schema';
import { getIsoDate } from '#/utils/iso-date';
import { log } from '#/utils/logger';

/** Name, description and status. Accounts are disabled, never deleted, so provenance keeps pointing at them (D18). */
export async function updateServiceAccountOp(ctx: UserContext, id: string, input: UpdateServiceAccountInput) {
  await requireOrgAdmin(ctx);
  const account = await findServiceAccountInTenant(ctx, id);
  const [updated] = await ctx.var.db
    .update(serviceAccountsTable)
    .set({ ...input, updatedAt: getIsoDate() })
    .where(eq(serviceAccountsTable.id, account.id))
    .returning();
  log.info('Service account updated', { serviceAccountId: id, status: updated.status });
  return updated;
}
