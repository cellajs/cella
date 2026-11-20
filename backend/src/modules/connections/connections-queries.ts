import { and, arrayOverlaps, eq, inArray, ne, not, or, sql } from 'drizzle-orm';
import type { DbContext } from '#/core/context';
import type { UserId } from '#/db/utils/ids';
import { servedColumns } from '#/db/utils/served-columns';
import { updateStamps } from '#/db/utils/stamps';
import {
  type ConnectionKind,
  connectionsTable,
  type InsertConnectionModel,
  isLtiConnection,
  type ServedConnection,
} from '#/modules/connections/connections-db';
import { maxLtiDeployments } from '#/modules/connections/connections-schema';
import { organizationsTable } from '#/modules/organization/organization-db';
import { tenantsTable } from '#/modules/tenants/tenants-db';
import { emailsTable } from '#/modules/user/emails-db';
import { identitiesTable } from '#/modules/user/identities-db';
import { pick } from '#/utils/pick';

/** Every column an answer may carry: all but the private key. */
const connectionColumns = servedColumns(connectionsTable);

interface FindConnectionsByTenantOpts {
  tenantId: string;
  /** Narrows to one kind; every kind when left out. */
  kind?: ConnectionKind;
}

/** The tenant's connections, oldest first, without their private keys; an LTI one still registering is left out. */
export const findConnectionsByTenant = async (ctx: DbContext, { tenantId, kind }: FindConnectionsByTenantOpts): Promise<ServedConnection[]> =>
  ctx.var.db
    .select(connectionColumns)
    .from(connectionsTable)
    .where(
      and(
        eq(connectionsTable.tenantId, tenantId),
        kind ? eq(connectionsTable.kind, kind) : undefined,
        or(ne(connectionsTable.kind, 'lti'), ne(connectionsTable.status, 'pending')),
      ),
    )
    .orderBy(connectionsTable.createdAt);

interface FindConnectionByIdOpts {
  id: string;
  /** Narrows to one tenant's connection, for the tenant-scoped routes. */
  tenantId?: string;
}

/** A connection by id, also when it is pending or disabled; undefined when none matches. */
export const findConnectionById = async (ctx: DbContext, { id, tenantId }: FindConnectionByIdOpts) => {
  const [row] = await ctx.var.db
    .select()
    .from(connectionsTable)
    .where(and(eq(connectionsTable.id, id), tenantId ? eq(connectionsTable.tenantId, tenantId) : undefined))
    .limit(1);
  return row;
};

/** A connection with the organization its tenant holds (null before the organization exists): what the entry page shows. */
export const findConnectionEntry = async (ctx: DbContext, { id }: { id: string }) => {
  const [row] = await ctx.var.db
    .select({ connection: connectionsTable, organization: pick(organizationsTable, ['id', 'name', 'slug', 'thumbnailUrl']) })
    .from(connectionsTable)
    .leftJoin(organizationsTable, eq(organizationsTable.tenantId, connectionsTable.tenantId))
    .where(eq(connectionsTable.id, id))
    .limit(1);
  return row;
};

interface FindActiveSsoConnectionByClaimOpts {
  federation: string;
  /** The asserted value of the federation's tenant claim, lower case. */
  claimValue: string;
}

/** The active SSO connection that accepts the asserted institution value, for a sign-in that started without one. */
export const findActiveSsoConnectionByClaim = async (ctx: DbContext, { federation, claimValue }: FindActiveSsoConnectionByClaimOpts) => {
  const [row] = await ctx.var.db
    .select()
    .from(connectionsTable)
    .where(
      and(
        eq(connectionsTable.kind, 'sso'),
        eq(connectionsTable.federation, federation),
        eq(connectionsTable.status, 'active'),
        arrayOverlaps(connectionsTable.claimValues, [claimValue]),
      ),
    )
    .limit(1);
  return row;
};

export interface FindConnectionsClaimingOpts {
  federation: string;
  claimValues: string[];
  /** The connection being updated, whose own values do not collide. */
  excludeId?: string;
}

/** SSO connections of any tenant that already accept one of the values. */
export const findConnectionsClaiming = async (ctx: DbContext, { federation, claimValues, excludeId }: FindConnectionsClaimingOpts) =>
  ctx.var.db
    .select({ id: connectionsTable.id, tenantId: connectionsTable.tenantId, claimValues: connectionsTable.claimValues })
    .from(connectionsTable)
    .where(
      and(
        eq(connectionsTable.kind, 'sso'),
        eq(connectionsTable.federation, federation),
        arrayOverlaps(connectionsTable.claimValues, claimValues),
        excludeId ? ne(connectionsTable.id, excludeId) : undefined,
      ),
    );

/** How many LTI connections a tenant holds, pending ones included. */
export const countLtiConnections = (ctx: DbContext, { tenantId }: { tenantId: string }) =>
  ctx.var.db.$count(connectionsTable, and(eq(connectionsTable.tenantId, tenantId), eq(connectionsTable.kind, 'lti')));

/** Inserts a connection; the unique indexes refuse a second SSO connection of a tenant and a second LTI registration of one client. */
export const insertConnection = async (ctx: DbContext, { values }: { values: InsertConnectionModel }): Promise<ServedConnection> => {
  const [row] = await ctx.var.db.insert(connectionsTable).values(values).returning(connectionColumns);
  return row;
};

/**
 * Locks a connection's row until the caller's transaction ends, leaving rows that reference it free to be written:
 * what hangs off one connection is made one transaction after the other, and a delete waits for it.
 * @returns False when no such connection exists, also once a delete committed.
 */
export const lockConnection = async (ctx: DbContext, { id }: { id: string }) => {
  const rows = await ctx.var.db.select({ id: connectionsTable.id }).from(connectionsTable).where(eq(connectionsTable.id, id)).for('no key update');
  return rows.length > 0;
};

/**
 * Holds a connection's row against its delete until the caller's transaction ends, and against nothing else: a delete
 * waits for the write under way, and none follows it.
 * @returns False when no such connection exists, also once a delete committed.
 */
export const holdConnection = async (ctx: DbContext, { id }: { id: string }) => {
  const rows = await ctx.var.db.select({ id: connectionsTable.id }).from(connectionsTable).where(eq(connectionsTable.id, id)).for('key share');
  return rows.length > 0;
};

/**
 * A tenant's connection by id, its row locked for its delete until the caller's transaction ends. The lock waits for
 * every write that references the row, a session's or an identity's included; each one after it waits for the
 * transaction and then finds the row gone.
 * @returns Undefined when the tenant holds no such connection.
 */
export const lockConnectionForDelete = async (ctx: DbContext, { id, tenantId }: { id: string; tenantId: string }) => {
  const [row] = await ctx.var.db
    .select()
    .from(connectionsTable)
    .where(and(eq(connectionsTable.id, id), eq(connectionsTable.tenantId, tenantId)))
    .for('update');
  return row;
};

interface UpdateConnectionOpts {
  id: string;
  tenantId: string;
  values: Partial<
    Pick<InsertConnectionModel, 'name' | 'clientId' | 'claimValues' | 'status' | 'jitProvisioning' | 'config' | 'updatedAt' | 'updatedBy'>
  >;
}

/** Writes `values` to one tenant's connection; the updated row without its private key, or undefined when the tenant holds no such connection. */
export const updateConnection = async (ctx: DbContext, { id, tenantId, values }: UpdateConnectionOpts) => {
  const [row] = await ctx.var.db
    .update(connectionsTable)
    .set(values)
    .where(and(eq(connectionsTable.id, id), eq(connectionsTable.tenantId, tenantId)))
    .returning(connectionColumns);
  return row;
};

/** Deletes one tenant's connection; the deleted row, or undefined when the tenant holds no such connection. */
export const deleteConnection = async (ctx: DbContext, { id, tenantId }: { id: string; tenantId: string }) => {
  const [row] = await ctx.var.db
    .delete(connectionsTable)
    .where(and(eq(connectionsTable.id, id), eq(connectionsTable.tenantId, tenantId)))
    .returning();
  return row;
};

/** The tenant's SSO connection (one per tenant), whatever its status; undefined when none. */
export const findSsoConnectionByTenant = async (ctx: DbContext, { tenantId }: { tenantId: string }) => {
  const [row] = await ctx.var.db
    .select()
    .from(connectionsTable)
    .where(and(eq(connectionsTable.tenantId, tenantId), eq(connectionsTable.kind, 'sso')))
    .limit(1);
  return row;
};

/** The active SSO connections of these tenants: the institutions a member could connect their account to. */
export const findActiveSsoConnectionsByTenants = async (ctx: DbContext, { tenantIds }: { tenantIds: string[] }) => {
  if (!tenantIds.length) return [];
  return ctx.var.db
    .select()
    .from(connectionsTable)
    .where(and(inArray(connectionsTable.tenantId, tenantIds), eq(connectionsTable.kind, 'sso'), eq(connectionsTable.status, 'active')));
};

/** The federations with at least one active connection: the generic entrance shows a button per federation. */
export const findActiveSsoFederations = async (ctx: DbContext) => {
  const rows = await ctx.var.db
    .selectDistinct({ federation: connectionsTable.federation })
    .from(connectionsTable)
    .where(and(eq(connectionsTable.kind, 'sso'), eq(connectionsTable.status, 'active')));
  return rows.map(({ federation }) => federation);
};

/**
 * The tenant's connection the user holds an identity through, if any: the fact that binds them to the tenant's
 * sign-in policy. Externals without such an identity are not bound.
 */
export const findUserSsoConnection = async (ctx: DbContext, { userId, tenantId }: { userId: string; tenantId: string }) => {
  const [row] = await ctx.var.db
    .select({ id: connectionsTable.id })
    .from(identitiesTable)
    .innerJoin(connectionsTable, eq(connectionsTable.id, identitiesTable.connectionId))
    .where(and(eq(identitiesTable.userId, userId), eq(identitiesTable.kind, 'sso'), eq(connectionsTable.tenantId, tenantId)))
    .limit(1);
  return row;
};

/**
 * The connection and tenant policy that govern an address proven through a federation: the ledger row's proof
 * names the federation, the account's identity through it names the connection, the connection's tenant holds the
 * policy. Undefined for an address proven any other way.
 */
export const findAddressGovernance = async (ctx: DbContext, { email }: { email: string }) => {
  const [row] = await ctx.var.db
    .select({
      connectionId: connectionsTable.id,
      name: connectionsTable.name,
      status: connectionsTable.status,
      authStrategies: tenantsTable.authStrategies,
    })
    .from(emailsTable)
    .innerJoin(
      identitiesTable,
      and(eq(identitiesTable.userId, emailsTable.userId), eq(identitiesTable.kind, 'sso'), eq(identitiesTable.provider, emailsTable.lastVerifiedVia)),
    )
    .innerJoin(connectionsTable, eq(connectionsTable.id, identitiesTable.connectionId))
    .innerJoin(tenantsTable, eq(tenantsTable.id, connectionsTable.tenantId))
    .where(eq(emailsTable.email, email))
    .limit(1);
  return row;
};

interface FindActiveLtiConnectionsOpts {
  issuer: string;
  /** Narrows to the connections of these client ids; every connection of the issuer when left out. */
  clientIds?: string[];
}

/** The active LTI connections of a platform's issuer, whichever tenant holds them: what a launch is checked against. */
export const findActiveLtiConnections = async (ctx: DbContext, { issuer, clientIds }: FindActiveLtiConnectionsOpts) => {
  const rows = await ctx.var.db
    .select()
    .from(connectionsTable)
    .where(
      and(
        eq(connectionsTable.kind, 'lti'),
        eq(connectionsTable.status, 'active'),
        eq(connectionsTable.issuer, issuer),
        clientIds === undefined ? undefined : inArray(connectionsTable.clientId, clientIds),
      ),
    )
    .limit(2);
  return rows.filter(isLtiConnection);
};

/** The LTI connection that holds a platform's issuer and client id, whichever tenant holds it; undefined when none does. */
export const findLtiConnectionByClient = async (ctx: DbContext, { issuer, clientId }: { issuer: string; clientId: string }) => {
  const [row] = await ctx.var.db
    .select({ id: connectionsTable.id, tenantId: connectionsTable.tenantId })
    .from(connectionsTable)
    .where(and(eq(connectionsTable.kind, 'lti'), eq(connectionsTable.issuer, issuer), eq(connectionsTable.clientId, clientId)));
  return row;
};

/**
 * Adds an LTI deployment to a connection that holds fewer than `maxLtiDeployments`. Two launches of new deployments at
 * once both add theirs: the second update waits for the first's commit, then appends to the list it wrote.
 * @returns Whether the connection holds `deploymentId` afterwards: false at the cap.
 */
export const addLtiDeployment = async (ctx: DbContext, { id, deploymentId, by }: { id: string; deploymentId: string; by: UserId }) => {
  const deploymentIds = sql`coalesce(${connectionsTable.config} -> 'deploymentIds', '[]'::jsonb)`;
  const holds = sql`${deploymentIds} @> jsonb_build_array(${deploymentId}::text)`;
  const added = await ctx.var.db
    .update(connectionsTable)
    .set({
      config: sql`jsonb_set(${connectionsTable.config}, '{deploymentIds}', ${deploymentIds} || jsonb_build_array(${deploymentId}::text))`,
      ...updateStamps(by),
    })
    .where(and(eq(connectionsTable.id, id), not(holds), sql`jsonb_array_length(${deploymentIds}) < ${maxLtiDeployments}`))
    .returning({ id: connectionsTable.id });
  if (added.length) return true;

  const holding = await ctx.var.db
    .select({ id: connectionsTable.id })
    .from(connectionsTable)
    .where(and(eq(connectionsTable.id, id), holds));
  return holding.length > 0;
};
