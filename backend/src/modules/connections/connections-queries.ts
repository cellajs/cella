import { and, arrayOverlaps, eq, inArray, ne } from 'drizzle-orm';
import type { DbContext } from '#/core/context';
import { identitiesTable } from '#/modules/auth/oauth/identities-db';
import { type ConnectionModel, connectionsTable, type InsertConnectionModel } from '#/modules/connections/connections-db';
import { organizationsTable } from '#/modules/organization/organization-db';
import { tenantsTable } from '#/modules/tenants/tenants-db';
import { emailsTable } from '#/modules/user/emails-db';

interface FindConnectionsByTenantOpts {
  tenantId: string;
}

export const findConnectionsByTenant = async (ctx: DbContext, { tenantId }: FindConnectionsByTenantOpts) => {
  return ctx.var.db.select().from(connectionsTable).where(eq(connectionsTable.tenantId, tenantId)).orderBy(connectionsTable.createdAt);
};

interface FindConnectionByIdOpts {
  id: string;
  /** Narrows to one tenant's connection, for the tenant-scoped routes. */
  tenantId?: string;
}

export const findConnectionById = async (ctx: DbContext, { id, tenantId }: FindConnectionByIdOpts) => {
  const [row] = await ctx.var.db
    .select()
    .from(connectionsTable)
    .where(and(eq(connectionsTable.id, id), tenantId ? eq(connectionsTable.tenantId, tenantId) : undefined))
    .limit(1);
  return row;
};

interface FindConnectionEntryOpts {
  id: string;
}

/** A connection with the organization its tenant holds (null before the organization exists): what the entry page shows. */
export const findConnectionEntry = async (ctx: DbContext, { id }: FindConnectionEntryOpts) => {
  const [row] = await ctx.var.db
    .select({
      connection: connectionsTable,
      organizationId: organizationsTable.id,
      organizationName: organizationsTable.name,
      organizationSlug: organizationsTable.slug,
      organizationThumbnailUrl: organizationsTable.thumbnailUrl,
    })
    .from(connectionsTable)
    .leftJoin(organizationsTable, eq(organizationsTable.tenantId, connectionsTable.tenantId))
    .where(eq(connectionsTable.id, id))
    .limit(1);
  if (!row) return undefined;
  const { connection, organizationId, organizationName, organizationSlug, organizationThumbnailUrl } = row;
  return {
    connection,
    organization: organizationId
      ? // Non-null within this branch: the left join returns them on the same row as the id.
        { id: organizationId, name: organizationName as string, slug: organizationSlug as string, thumbnailUrl: organizationThumbnailUrl }
      : null,
  };
};

interface FindActiveSsoConnectionByClaimOpts {
  issuer: string;
  /** The asserted value of the federation's tenant claim, lower case. */
  claimValue: string;
}

/** The active SSO connection that accepts the asserted institution value, for a sign-in that started without one. */
export const findActiveSsoConnectionByClaim = async (ctx: DbContext, { issuer, claimValue }: FindActiveSsoConnectionByClaimOpts) => {
  const [row] = await ctx.var.db
    .select()
    .from(connectionsTable)
    .where(
      and(
        eq(connectionsTable.kind, 'sso'),
        eq(connectionsTable.issuer, issuer),
        eq(connectionsTable.status, 'active'),
        arrayOverlaps(connectionsTable.claimValues, [claimValue]),
      ),
    )
    .limit(1);
  return row;
};

interface FindConnectionsClaimingOpts {
  issuer: string;
  claimValues: string[];
  /** The connection being updated, whose own values do not collide. */
  excludeId?: string;
}

/** SSO connections of any tenant that already accept one of the values: a domain names one institution, so one connection. */
export const findConnectionsClaiming = async (ctx: DbContext, { issuer, claimValues, excludeId }: FindConnectionsClaimingOpts) => {
  return ctx.var.db
    .select({ id: connectionsTable.id, tenantId: connectionsTable.tenantId, claimValues: connectionsTable.claimValues })
    .from(connectionsTable)
    .where(
      and(
        eq(connectionsTable.kind, 'sso'),
        eq(connectionsTable.issuer, issuer),
        arrayOverlaps(connectionsTable.claimValues, claimValues),
        excludeId ? ne(connectionsTable.id, excludeId) : undefined,
      ),
    );
};

interface InsertConnectionOpts {
  values: InsertConnectionModel;
}

export const insertConnection = async (ctx: DbContext, { values }: InsertConnectionOpts): Promise<ConnectionModel> => {
  const [row] = await ctx.var.db.insert(connectionsTable).values(values).returning();
  return row;
};

interface UpdateConnectionOpts {
  id: string;
  tenantId: string;
  values: Partial<Pick<InsertConnectionModel, 'displayName' | 'claimValues' | 'status' | 'jitProvisioning' | 'config'>>;
}

export const updateConnection = async (ctx: DbContext, { id, tenantId, values }: UpdateConnectionOpts) => {
  const [row] = await ctx.var.db
    .update(connectionsTable)
    .set(values)
    .where(and(eq(connectionsTable.id, id), eq(connectionsTable.tenantId, tenantId)))
    .returning();
  return row;
};

interface DeleteConnectionOpts {
  id: string;
  tenantId: string;
}

export const deleteConnection = async (ctx: DbContext, { id, tenantId }: DeleteConnectionOpts) => {
  const [row] = await ctx.var.db
    .delete(connectionsTable)
    .where(and(eq(connectionsTable.id, id), eq(connectionsTable.tenantId, tenantId)))
    .returning();
  return row;
};

interface FindSsoConnectionByTenantOpts {
  tenantId: string;
}

/** The tenant's SSO connection (one per tenant), whatever its status; undefined when none. */
export const findSsoConnectionByTenant = async (ctx: DbContext, { tenantId }: FindSsoConnectionByTenantOpts) => {
  const [row] = await ctx.var.db
    .select()
    .from(connectionsTable)
    .where(and(eq(connectionsTable.tenantId, tenantId), eq(connectionsTable.kind, 'sso')))
    .limit(1);
  return row;
};

interface FindSsoConnectionsByTenantsOpts {
  tenantIds: string[];
}

/** The active SSO connections of these tenants: the institutions a member could connect their account to. */
export const findActiveSsoConnectionsByTenants = async (ctx: DbContext, { tenantIds }: FindSsoConnectionsByTenantsOpts) => {
  if (!tenantIds.length) return [];
  return ctx.var.db
    .select()
    .from(connectionsTable)
    .where(and(inArray(connectionsTable.tenantId, tenantIds), eq(connectionsTable.kind, 'sso'), eq(connectionsTable.status, 'active')));
};

/** The federations with at least one active connection: the generic entrance shows a button per federation. */
export const findActiveSsoFederations = async (ctx: DbContext) => {
  const rows = await ctx.var.db
    .selectDistinct({ issuer: connectionsTable.issuer })
    .from(connectionsTable)
    .where(and(eq(connectionsTable.kind, 'sso'), eq(connectionsTable.status, 'active')));
  return rows.map(({ issuer }) => issuer);
};

interface FindConnectionBindingUserOpts {
  userId: string;
  tenantId: string;
}

/**
 * The tenant's connection the user holds an identity through, if any: the fact that binds them to the tenant's
 * sign-in policy (D17). Externals without such an identity are not bound.
 */
export const findConnectionBindingUser = async (ctx: DbContext, { userId, tenantId }: FindConnectionBindingUserOpts) => {
  const [row] = await ctx.var.db
    .select({ id: connectionsTable.id })
    .from(identitiesTable)
    .innerJoin(connectionsTable, eq(connectionsTable.id, identitiesTable.connectionId))
    .where(and(eq(identitiesTable.userId, userId), eq(identitiesTable.kind, 'sso'), eq(connectionsTable.tenantId, tenantId)))
    .limit(1);
  return row;
};

interface FindAddressGovernanceOpts {
  email: string;
}

/**
 * The connection and tenant policy that govern an address proven through a federation (D16): the ledger row's proof
 * names the federation, the account's identity through it names the connection, the connection's tenant holds the
 * policy. Undefined for an address proven any other way.
 */
export const findAddressGovernance = async (ctx: DbContext, { email }: FindAddressGovernanceOpts) => {
  const [row] = await ctx.var.db
    .select({ connectionId: connectionsTable.id, status: connectionsTable.status, authStrategies: tenantsTable.authStrategies })
    .from(emailsTable)
    .innerJoin(
      identitiesTable,
      and(eq(identitiesTable.userId, emailsTable.userId), eq(identitiesTable.kind, 'sso'), eq(identitiesTable.issuer, emailsTable.lastVerifiedVia)),
    )
    .innerJoin(connectionsTable, eq(connectionsTable.id, identitiesTable.connectionId))
    .innerJoin(tenantsTable, eq(tenantsTable.id, connectionsTable.tenantId))
    .where(eq(emailsTable.email, email))
    .limit(1);
  return row;
};
