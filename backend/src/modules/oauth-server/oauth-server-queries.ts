import { and, eq, sql } from 'drizzle-orm';
import type { DbContext } from '#/core/context';
import { oauthClientsTable } from '#/modules/oauth-server/oauth-clients-db';
import { oidcPayloadsTable } from '#/modules/oauth-server/oidc-payloads-db';

/** The consents (Grant rows) of one account with the registered client's name when there is one, oldest first. */
export async function findGrantsByAccount(ctx: DbContext, { accountId }: { accountId: string }) {
  return ctx.var.db
    .select({ row: oidcPayloadsTable, clientName: oauthClientsTable.name })
    .from(oidcPayloadsTable)
    .leftJoin(oauthClientsTable, eq(oauthClientsTable.id, sql`${oidcPayloadsTable.payload}->>'clientId'`))
    .where(and(eq(oidcPayloadsTable.type, 'Grant'), eq(oidcPayloadsTable.accountId, accountId)))
    .orderBy(oidcPayloadsTable.createdAt);
}

export async function findGrantOfAccount(
  ctx: DbContext,
  { grantId, accountId }: { grantId: string; accountId: string },
) {
  const [grant] = await ctx.var.db
    .select({ id: oidcPayloadsTable.id })
    .from(oidcPayloadsTable)
    .where(
      and(
        eq(oidcPayloadsTable.type, 'Grant'),
        eq(oidcPayloadsTable.id, grantId),
        eq(oidcPayloadsTable.accountId, accountId),
      ),
    )
    .limit(1);
  return grant;
}

/** The grant and every token issued under it, in one transaction; the client must ask again. */
export async function deleteGrantWithTokens(ctx: DbContext, { grantId }: { grantId: string }): Promise<void> {
  await ctx.var.db.transaction(async (tx) => {
    await tx.delete(oidcPayloadsTable).where(eq(oidcPayloadsTable.grantId, grantId));
    await tx
      .delete(oidcPayloadsTable)
      .where(and(eq(oidcPayloadsTable.type, 'Grant'), eq(oidcPayloadsTable.id, grantId)));
  });
}
