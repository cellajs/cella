import { and, eq } from 'drizzle-orm';
import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { serviceAccountsTable } from '#/modules/service-accounts/service-accounts-db';
import type { UpdateServiceAccountInput } from '#/modules/service-accounts/service-accounts-schema';
import { getValidChannel } from '#/permissions';
import { getIsoDate } from '#/utils/iso-date';
import { log } from '#/utils/logger';

/** Name, description and status. Accounts are disabled, never deleted, so provenance keeps pointing at them (D18). */
export async function updateServiceAccountOp(ctx: UserContext, id: string, input: UpdateServiceAccountInput) {
  const { db, tenantId, organizationId } = ctx.var;
  await getValidChannel(ctx, organizationId, 'organization', 'update');

  const [updated] = await db
    .update(serviceAccountsTable)
    .set({ ...input, updatedAt: getIsoDate() })
    .where(and(eq(serviceAccountsTable.id, id), eq(serviceAccountsTable.tenantId, tenantId)))
    .returning();
  if (!updated) throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'serviceAccount' } });

  log.info('Service account updated', { serviceAccountId: id, status: updated.status });
  return updated;
}
