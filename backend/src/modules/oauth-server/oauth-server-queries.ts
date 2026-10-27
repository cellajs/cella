import { and, eq, inArray, sql } from 'drizzle-orm';
import { isUuid } from 'shared/utils/entity-id';
import type { DbContext } from '#/core/context';
import { actorsTable } from '#/modules/actors/actors-db';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { oauthClientsTable } from '#/modules/oauth-server/oauth-clients-db';
import { oidcPayloadsTable } from '#/modules/oauth-server/oidc-payloads-db';
import type { ResourceRef } from '#/modules/oauth-server/resources';
import { organizationsTable } from '#/modules/organization/organization-db';
import { tenantsTable } from '#/modules/tenants/tenants-db';

interface FindConsentTargetNamesOpts {
  userId: string;
  resource: ResourceRef;
}

/**
 * The names a consent page shows for where a grant reaches: the tenant, and on the MCP face the organization, each
 * only when the user holds a membership in it. The caller has settled that the user is a member of the tenant.
 */
export async function findConsentTargetNames(
  ctx: DbContext,
  { userId, resource }: FindConsentTargetNamesOpts,
): Promise<{ tenant: string | null; organization: string | null }> {
  const [tenant] = await ctx.var.db.select({ name: tenantsTable.name }).from(tenantsTable).where(eq(tenantsTable.id, resource.tenantId)).limit(1);
  // The resource grammar takes any path segment for the organization; only a uuid can name one.
  if (resource.face !== 'mcp' || !isUuid(resource.organizationId)) {
    return { tenant: tenant?.name ?? null, organization: null };
  }
  const [organization] = await ctx.var.db
    .select({ name: organizationsTable.name })
    .from(organizationsTable)
    .innerJoin(membershipsTable, and(eq(membershipsTable.organizationId, organizationsTable.id), eq(membershipsTable.userId, userId)))
    .where(and(eq(organizationsTable.id, resource.organizationId), eq(organizationsTable.tenantId, resource.tenantId)))
    .limit(1);
  return { tenant: tenant?.name ?? null, organization: organization?.name ?? null };
}

interface FindGrantsByUserOpts {
  userId: string;
}

/** The grants of one user (the provider's `accountId`) with the registered client's name when there is one, oldest first. */
export async function findGrantsByUser(ctx: DbContext, { userId }: FindGrantsByUserOpts) {
  return ctx.var.db
    .select({ row: oidcPayloadsTable, clientName: oauthClientsTable.name })
    .from(oidcPayloadsTable)
    .leftJoin(oauthClientsTable, eq(oauthClientsTable.id, sql`${oidcPayloadsTable.payload}->>'clientId'`))
    .where(and(eq(oidcPayloadsTable.type, 'Grant'), eq(oidcPayloadsTable.accountId, userId)))
    .orderBy(oidcPayloadsTable.createdAt);
}

interface FindGrantByUserOpts {
  grantId: string;
  userId: string;
}

/** The grant's id while the grant exists and belongs to the user; undefined otherwise. */
export async function findGrantByUser(ctx: DbContext, { grantId, userId }: FindGrantByUserOpts) {
  const [grant] = await ctx.var.db
    .select({ id: oidcPayloadsTable.id })
    .from(oidcPayloadsTable)
    .where(and(eq(oidcPayloadsTable.type, 'Grant'), eq(oidcPayloadsTable.id, grantId), eq(oidcPayloadsTable.accountId, userId)))
    .limit(1);
  return grant;
}

interface FindLiveGrantBindingsOpts {
  grantId: string;
  userId: string;
}

/**
 * What a person's token rests on at each use: the user's bindings version while the grant it names exists, undefined
 * once the grant is gone (revoked, replayed, refused at refresh, or the account deleted).
 */
export async function findLiveGrantBindings(ctx: DbContext, { grantId, userId }: FindLiveGrantBindingsOpts) {
  // The text columns take any claim as it came; the stored account id is a user's, so the cast that joins it holds.
  const [live] = await ctx.var.db
    .select({ bindingsVersion: actorsTable.bindingsVersion })
    .from(oidcPayloadsTable)
    .innerJoin(actorsTable, eq(actorsTable.id, sql`${oidcPayloadsTable.accountId}::uuid`))
    .where(and(eq(oidcPayloadsTable.type, 'Grant'), eq(oidcPayloadsTable.id, grantId), eq(oidcPayloadsTable.accountId, userId)))
    .limit(1);
  return live;
}

interface DeleteProviderSessionsByUserOpts {
  userId: string;
}

/**
 * The authorization server's sessions of a user, in every browser: none answers a client for them any more until they
 * consent again. Their grants and refresh tokens stay.
 */
export async function deleteProviderSessionsByUser(ctx: DbContext, { userId }: DeleteProviderSessionsByUserOpts): Promise<void> {
  await ctx.var.db.delete(oidcPayloadsTable).where(and(eq(oidcPayloadsTable.type, 'Session'), eq(oidcPayloadsTable.accountId, userId)));
}

interface DeleteProviderSessionOpts {
  /** The session's id, which its `_session` cookie carries. */
  id: string;
}

/** One authorization server session. */
export async function deleteProviderSession(ctx: DbContext, { id }: DeleteProviderSessionOpts): Promise<void> {
  await ctx.var.db.delete(oidcPayloadsTable).where(and(eq(oidcPayloadsTable.type, 'Session'), eq(oidcPayloadsTable.id, id)));
}

interface DeleteProviderRowsByUsersOpts {
  userIds: string[];
}

/** Everything the authorization server holds for these users (grants, codes, refresh tokens, sessions): an account deletion. */
export async function deleteProviderRowsByUsers(ctx: DbContext, { userIds }: DeleteProviderRowsByUsersOpts): Promise<void> {
  if (userIds.length) await ctx.var.db.delete(oidcPayloadsTable).where(inArray(oidcPayloadsTable.accountId, userIds));
}

interface DeleteGrantWithTokensOpts {
  grantId: string;
}

/**
 * The grant and every token issued under it, on the caller's transaction; the client must ask again. `revokeGrant`
 * runs it on the transaction that also publishes the revocation, so the grant's access tokens stop with the delete.
 * @returns The account the grant belonged to, or null when there was no such grant.
 */
export async function deleteGrantWithTokens(ctx: DbContext, { grantId }: DeleteGrantWithTokensOpts): Promise<string | null> {
  await ctx.var.db.delete(oidcPayloadsTable).where(eq(oidcPayloadsTable.grantId, grantId));
  return deleteGrant(ctx, { grantId });
}

interface DeleteGrantOpts {
  grantId: string;
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

interface StampGrantSignInOpts {
  grantId: string;
  /** How the person signed in to the session that consented, and through which SSO connection. */
  authStrategy: string;
  connectionId: string | null;
}

/**
 * Records on the grant how its consenting session was signed in, so the tokens issued under it carry the method
 * and a tenant's sign-in policy reaches delegated tokens. Written next to the provider's own payload; a later consent
 * stamps it again.
 */
export async function stampGrantSignIn(ctx: DbContext, { grantId, authStrategy, connectionId }: StampGrantSignInOpts): Promise<void> {
  const stamp = { authStrategy, connectionId };
  await ctx.var.db
    .update(oidcPayloadsTable)
    .set({ payload: sql`${oidcPayloadsTable.payload} || ${JSON.stringify(stamp)}::jsonb` })
    .where(and(eq(oidcPayloadsTable.type, 'Grant'), eq(oidcPayloadsTable.id, grantId)));
}

interface FindGrantSignInOpts {
  grantId: string;
}

/** The sign-in facts stamped on a grant; nulls for a grant consented before the stamp existed. */
export async function findGrantSignIn(ctx: DbContext, { grantId }: FindGrantSignInOpts) {
  const [row] = await ctx.var.db
    .select({
      authStrategy: sql<string | null>`${oidcPayloadsTable.payload} ->> 'authStrategy'`,
      connectionId: sql<string | null>`${oidcPayloadsTable.payload} ->> 'connectionId'`,
    })
    .from(oidcPayloadsTable)
    .where(and(eq(oidcPayloadsTable.type, 'Grant'), eq(oidcPayloadsTable.id, grantId)))
    .limit(1);
  return row ?? { authStrategy: null, connectionId: null };
}
