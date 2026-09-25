import { and, eq, inArray, sql } from 'drizzle-orm';
import type { DbContext } from '#/core/context';
import { oauthClientsTable } from '#/modules/oauth-server/oauth-clients-db';
import { oidcPayloadsTable } from '#/modules/oauth-server/oidc-payloads-db';

/** The consents (Grant rows) of one user (the provider's `accountId`) with the registered client's name when there is one, oldest first. */
export async function findConsentsByUser(ctx: DbContext, { userId }: { userId: string }) {
  return ctx.var.db
    .select({ row: oidcPayloadsTable, clientName: oauthClientsTable.name })
    .from(oidcPayloadsTable)
    .leftJoin(oauthClientsTable, eq(oauthClientsTable.id, sql`${oidcPayloadsTable.payload}->>'clientId'`))
    .where(and(eq(oidcPayloadsTable.type, 'Grant'), eq(oidcPayloadsTable.accountId, userId)))
    .orderBy(oidcPayloadsTable.createdAt);
}

export async function findConsentOfUser(ctx: DbContext, { grantId, userId }: { grantId: string; userId: string }) {
  const [grant] = await ctx.var.db
    .select({ id: oidcPayloadsTable.id })
    .from(oidcPayloadsTable)
    .where(
      and(
        eq(oidcPayloadsTable.type, 'Grant'),
        eq(oidcPayloadsTable.id, grantId),
        eq(oidcPayloadsTable.accountId, userId),
      ),
    )
    .limit(1);
  return grant;
}

/** Everything the authorization server holds for these users (grants, codes, refresh tokens, sessions): an account deletion. */
export async function deleteConsentsOfUsers(ctx: DbContext, { userIds }: { userIds: string[] }): Promise<void> {
  if (userIds.length) await ctx.var.db.delete(oidcPayloadsTable).where(inArray(oidcPayloadsTable.accountId, userIds));
}

/** The grant and every token issued under it, in one transaction; the client must ask again. */
export async function deleteConsentWithTokens(ctx: DbContext, { grantId }: { grantId: string }): Promise<void> {
  await ctx.var.db.transaction(async (tx) => {
    await tx.delete(oidcPayloadsTable).where(eq(oidcPayloadsTable.grantId, grantId));
    await tx
      .delete(oidcPayloadsTable)
      .where(and(eq(oidcPayloadsTable.type, 'Grant'), eq(oidcPayloadsTable.id, grantId)));
  });
}
