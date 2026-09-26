import { z } from '@hono/zod-openapi';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { DbContext } from '#/core/context';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { oauthClientsTable } from '#/modules/oauth-server/oauth-clients-db';
import { oidcPayloadsTable } from '#/modules/oauth-server/oidc-payloads-db';
import type { ResourceRef } from '#/modules/oauth-server/resources';
import { organizationsTable } from '#/modules/organization/organization-db';
import { tenantsTable } from '#/modules/tenants/tenants-db';

interface GetConsentTargetNamesOpts {
  userId: string;
  resource: ResourceRef;
}

/**
 * The names a consent page shows for where a grant reaches: the tenant, and on the MCP face the organization, each
 * only when the user holds a membership in it. The caller has settled that the user is a member of the tenant.
 */
export async function getConsentTargetNames(
  ctx: DbContext,
  { userId, resource }: GetConsentTargetNamesOpts,
): Promise<{ tenant: string | null; organization: string | null }> {
  const [tenant] = await ctx.var.db
    .select({ name: tenantsTable.name })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, resource.tenantId))
    .limit(1);
  // The resource grammar takes any path segment for the organization; only a uuid can name one.
  if (resource.face !== 'mcp' || !z.uuid().safeParse(resource.organizationId).success) {
    return { tenant: tenant?.name ?? null, organization: null };
  }
  const [organization] = await ctx.var.db
    .select({ name: organizationsTable.name })
    .from(organizationsTable)
    .innerJoin(
      membershipsTable,
      and(eq(membershipsTable.organizationId, organizationsTable.id), eq(membershipsTable.userId, userId)),
    )
    .where(and(eq(organizationsTable.id, resource.organizationId), eq(organizationsTable.tenantId, resource.tenantId)))
    .limit(1);
  return { tenant: tenant?.name ?? null, organization: organization?.name ?? null };
}

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

interface DeleteProviderSessionsOfUserOpts {
  userId: string;
}

/**
 * The authorization server's sessions of a user, in every browser: none answers a client for them any more until they
 * consent again. Their grants and refresh tokens stay.
 */
export async function deleteProviderSessionsOfUser(
  ctx: DbContext,
  { userId }: DeleteProviderSessionsOfUserOpts,
): Promise<void> {
  await ctx.var.db
    .delete(oidcPayloadsTable)
    .where(and(eq(oidcPayloadsTable.type, 'Session'), eq(oidcPayloadsTable.accountId, userId)));
}

interface DeleteProviderSessionOpts {
  /** The session's id, which its `_session` cookie carries. */
  id: string;
}

/** One authorization server session. */
export async function deleteProviderSession(ctx: DbContext, { id }: DeleteProviderSessionOpts): Promise<void> {
  await ctx.var.db
    .delete(oidcPayloadsTable)
    .where(and(eq(oidcPayloadsTable.type, 'Session'), eq(oidcPayloadsTable.id, id)));
}

/** Everything the authorization server holds for these users (grants, codes, refresh tokens, sessions): an account deletion. */
export async function deleteConsentsOfUsers(ctx: DbContext, { userIds }: { userIds: string[] }): Promise<void> {
  if (userIds.length) await ctx.var.db.delete(oidcPayloadsTable).where(inArray(oidcPayloadsTable.accountId, userIds));
}

interface DeleteGrantOpts {
  grantId: string;
}

/**
 * The grant and every token issued under it, in one transaction; the client must ask again. Call it through
 * `revokeGrant`, which stops the grant's access tokens too.
 * @returns The account the grant belonged to, or null when there was no such grant.
 */
export async function deleteConsentWithTokens(ctx: DbContext, { grantId }: DeleteGrantOpts): Promise<string | null> {
  return ctx.var.db.transaction(async (tx) => {
    await tx.delete(oidcPayloadsTable).where(eq(oidcPayloadsTable.grantId, grantId));
    return deleteGrant({ var: { db: tx } }, { grantId });
  });
}

/**
 * The Grant row alone, for when the provider deletes the grant's tokens itself.
 * @returns The account the grant belonged to, or null when there was no such grant.
 */
export async function deleteGrant(ctx: DbContext, { grantId }: DeleteGrantOpts): Promise<string | null> {
  const [grant] = await ctx.var.db
    .delete(oidcPayloadsTable)
    .where(and(eq(oidcPayloadsTable.type, 'Grant'), eq(oidcPayloadsTable.id, grantId)))
    .returning({ accountId: oidcPayloadsTable.accountId });
  return grant?.accountId ?? null;
}
