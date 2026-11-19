import { and, asc, eq, getColumns, gt, inArray, isNotNull, sql } from 'drizzle-orm';
import { type Access, type AccessScope, appConfig, hierarchy } from 'shared';
import type { ActorBinding, DbContext } from '#/core/context';
import type { ActorId } from '#/db/utils/ids';
import { updateStamps } from '#/db/utils/stamps';
import { type LtiReleasableField, ltiInstallationsTable } from '#/modules/lti-platform/lti-installations-db';
import type { LtiToolConfig } from '#/modules/lti-platform/lti-platform-schema';
import { ltiResourceLinksTable } from '#/modules/lti-platform/lti-resource-links-db';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { oauthClientsTable } from '#/modules/oauth-server/oauth-clients-db';
import { serviceAccountsTable } from '#/modules/service-accounts/service-accounts-db';
import { insertServiceAccount, updateServiceAccount } from '#/modules/service-accounts/service-accounts-queries';
import { servedUserSelect } from '#/modules/user/helpers/select';
import { usersTable } from '#/modules/user/user-db';
import { readableMembershipsWhere } from '#/permissions/visible-people';
import type { ChannelRef, OrderDirection } from '#/schemas/common-schemas';
import { getOrderColumns } from '#/utils/order-column';
import { pick } from '#/utils/pick';

const { secretHash: _secretHash, ltiToolConfig, initiateLoginUri, jwksUri, ...clientColumns } = getColumns(oauthClientsTable);

/**
 * An installation with its service account and its registration; the where clause keeps LTI registrations only, whose
 * login and key set addresses `oauth_clients_lti_check` holds present.
 */
const installationSelect = {
  account: serviceAccountsTable,
  installation: ltiInstallationsTable,
  client: {
    ...clientColumns,
    ltiToolConfig: sql<LtiToolConfig>`${ltiToolConfig}`,
    initiateLoginUri: sql<string>`${initiateLoginUri}`,
    jwksUri: sql<string>`${jwksUri}`,
  },
};

const installationJoin = (ctx: DbContext) =>
  ctx.var.db
    .select(installationSelect)
    .from(serviceAccountsTable)
    .innerJoin(ltiInstallationsTable, eq(ltiInstallationsTable.serviceAccountId, serviceAccountsTable.id))
    .innerJoin(oauthClientsTable, eq(oauthClientsTable.id, serviceAccountsTable.oauthClientId));

/** An installation as the platform reads it: the service account, its LTI side row and the registration. */
export type LtiInstallationRecord = Awaited<ReturnType<typeof findLtiInstallations>>[number];

/** The tenant's LTI installations, in `order` of creation. */
export async function findLtiInstallations(ctx: DbContext, { tenantId, order }: { tenantId: string; order: OrderDirection }) {
  const orderBy = getOrderColumns({
    sort: 'createdAt',
    order,
    columns: { createdAt: ltiInstallationsTable.createdAt },
    tieBreaker: ltiInstallationsTable.serviceAccountId,
  });
  return installationJoin(ctx)
    .where(and(eq(serviceAccountsTable.tenantId, tenantId), isNotNull(ltiToolConfig)))
    .orderBy(...orderBy);
}

/**
 * The installation of an LTI registration, by the registration's `client_id`, in the one tenant the registration is
 * private to; undefined for any other client. `service_accounts_oauth_client_idx` holds one installation per client and tenant.
 */
export async function findLtiInstallationByClient(ctx: DbContext, { clientId }: { clientId: string }) {
  const [found] = await installationJoin(ctx).where(
    and(eq(oauthClientsTable.id, clientId), eq(serviceAccountsTable.tenantId, oauthClientsTable.tenantId), isNotNull(ltiToolConfig)),
  );
  return found;
}

/** One installation of the tenant with its registration; undefined when the tenant has no such installation. */
export async function findLtiInstallation(ctx: DbContext, { id, tenantId }: { id: string; tenantId: string }) {
  const [found] = await installationJoin(ctx).where(
    and(eq(serviceAccountsTable.id, id), eq(serviceAccountsTable.tenantId, tenantId), isNotNull(ltiToolConfig)),
  );
  return found;
}

/**
 * One installation of the tenant, its service account row locked until the transaction ends: an approval and a
 * rejection of one installation run one after the other. Undefined when the tenant has no such installation.
 */
export async function lockLtiInstallation(ctx: DbContext, { id, tenantId }: { id: string; tenantId: string }) {
  const [found] = await installationJoin(ctx)
    .where(and(eq(serviceAccountsTable.id, id), eq(serviceAccountsTable.tenantId, tenantId), isNotNull(ltiToolConfig)))
    .for('update', { of: serviceAccountsTable });
  return found;
}

interface InsertLtiToolRegistrationOpts {
  client: typeof oauthClientsTable.$inferInsert & { tenantId: string; ltiToolConfig: LtiToolConfig };
  organizationId: string;
}

/**
 * Stores an LTI tool's registration, private to its tenant, with its installation there: a pending service account
 * at the organization's least privileged role and its LTI side row, written by whoever wrote the registration.
 * @returns The installation's service account.
 */
export async function insertLtiToolRegistration(ctx: DbContext, { client, organizationId }: InsertLtiToolRegistrationOpts) {
  return ctx.var.db.transaction(async (tx) => {
    const txCtx = { var: { db: tx } };
    await tx.insert(oauthClientsTable).values(client);
    const role = hierarchy.getLeastPrivilegedRole('organization');
    const account = await insertServiceAccount(txCtx, {
      values: {
        tenantId: client.tenantId,
        name: client.name,
        status: 'pending',
        bindings: [{ channelType: 'organization', channelId: organizationId, organizationId, role }],
        oauthClientId: client.id,
        createdBy: client.createdBy,
      },
    });
    await tx.insert(ltiInstallationsTable).values({ serviceAccountId: account.id, createdBy: client.createdBy });
    return account;
  });
}

interface ApproveLtiInstallationOpts {
  id: string;
  tenantId: string;
  releasedFields: LtiReleasableField[];
  grantedScopes: AccessScope[];
  by: ActorId;
}

/**
 * Approves an installation inside the caller's transaction: its service account turns active and its side row records
 * the released fields, the granted scopes and the approval, both stamped by `by`.
 * @returns What the two rows were set to.
 */
export async function approveLtiInstallation(ctx: DbContext, { id, tenantId, releasedFields, grantedScopes, by }: ApproveLtiInstallationOpts) {
  const stamps = updateStamps(by);
  const decision = {
    releasedFields: [...new Set(releasedFields)],
    grantedScopes: [...new Set(grantedScopes)],
    approvedAt: stamps.updatedAt,
    approvedBy: stamps.updatedBy,
    ...stamps,
  };
  await updateServiceAccount(ctx, { id, tenantId, values: { status: 'active', ...stamps } });
  await ctx.var.db.update(ltiInstallationsTable).set(decision).where(eq(ltiInstallationsTable.serviceAccountId, id));
  return { stamps, decision };
}

/**
 * Replaces the access scopes an installation's tokens may carry, stamped by `by`.
 * @returns What the side row was set to.
 */
export async function updateLtiInstallationScopes(
  ctx: DbContext,
  { id, grantedScopes, by }: { id: string; grantedScopes: AccessScope[]; by: ActorId },
) {
  const values = { grantedScopes: [...new Set(grantedScopes)], ...updateStamps(by) };
  await ctx.var.db.update(ltiInstallationsTable).set(values).where(eq(ltiInstallationsTable.serviceAccountId, id));
  return values;
}

/** Deletes a registration private to the tenant. The service account that installs it and its side row cascade. */
export async function deleteTenantLtiRegistration(ctx: DbContext, { id, tenantId }: { id: string; tenantId: string }) {
  await ctx.var.db.delete(oauthClientsTable).where(and(eq(oauthClientsTable.id, id), eq(oauthClientsTable.tenantId, tenantId)));
}

/** The resource links of one channel of the tenant, or those of one installation in an organization. */
type FindLtiResourceLinksOpts = { tenantId: string; order: OrderDirection } & (
  | { channelId: string }
  | { installationId: string; organizationId: string }
);

/** The resource links placed in one channel, or the ones that place one installation in an organization, in `order` of creation. */
export async function findLtiResourceLinks(ctx: DbContext, { tenantId, order, ...where }: FindLtiResourceLinksOpts) {
  const orderBy = getOrderColumns({
    sort: 'createdAt',
    order,
    columns: { createdAt: ltiResourceLinksTable.createdAt },
    tieBreaker: ltiResourceLinksTable.id,
  });
  const placedBy =
    'channelId' in where
      ? eq(ltiResourceLinksTable.channelId, where.channelId)
      : and(eq(ltiResourceLinksTable.installationId, where.installationId), eq(ltiResourceLinksTable.organizationId, where.organizationId));
  return ctx.var.db
    .select()
    .from(ltiResourceLinksTable)
    .where(and(eq(ltiResourceLinksTable.tenantId, tenantId), placedBy))
    .orderBy(...orderBy);
}

/** One resource link of the organization; undefined when it has none of that id. */
export async function findLtiResourceLink(ctx: DbContext, { id, organizationId }: { id: string; organizationId: string }) {
  const [found] = await ctx.var.db
    .select()
    .from(ltiResourceLinksTable)
    .where(and(eq(ltiResourceLinksTable.id, id), eq(ltiResourceLinksTable.organizationId, organizationId)));
  return found;
}

/** What `placementContext` reads of a resource link: its channel and the channel id columns above it. */
const placementSelect = pick(getColumns(ltiResourceLinksTable), [
  'channelType',
  'channelId',
  ...appConfig.channelEntityTypes.map((channelType) => appConfig.entityIdColumnKeys[channelType]),
]);

interface FindLtiPlacementsOpts {
  installationId: string;
  organizationId: string;
  course: ChannelRef;
}

/** The channels of every tab that is on and places the installation in the organization, in the course or below it. */
export async function findLtiPlacements(ctx: DbContext, { installationId, organizationId, course }: FindLtiPlacementsOpts) {
  return ctx.var.db
    .select(placementSelect)
    .from(ltiResourceLinksTable)
    .where(
      and(
        eq(ltiResourceLinksTable.installationId, installationId),
        eq(ltiResourceLinksTable.organizationId, organizationId),
        eq(ltiResourceLinksTable.enabled, true),
        eq(getColumns(ltiResourceLinksTable)[appConfig.entityIdColumnKeys[course.channelType]], course.channelId),
      ),
    );
}

interface FindLtiMembersOpts extends ChannelRef {
  organizationId: string;
  /** The reader's access: a person shows when it reads one of their membership rows (`readableMembershipsWhere`). */
  access: Access<ActorBinding>;
  /** The id the people follow; from the first when omitted. */
  after?: string;
  limit: number;
}

/**
 * A channel's people in order of id, which an installed LTI tool reads: an order by name or address would tell what is
 * not released. Of each, their role in the channel, which their LTI roles there come from, and what a launch's personal
 * claims read, the address only once proven.
 */
export async function findLtiMembers(ctx: DbContext, { organizationId, channelType, channelId, access, after, limit }: FindLtiMembersOpts) {
  const { id, name, givenName, familyName, email, thumbnailUrl } = servedUserSelect;
  const readable = ctx.var.db
    .select({ userId: membershipsTable.userId })
    .from(membershipsTable)
    .where(readableMembershipsWhere(access, [organizationId]));
  return ctx.var.db
    .select({ id, name, givenName, familyName, email, thumbnailUrl, role: membershipsTable.role })
    .from(usersTable)
    .innerJoin(membershipsTable, eq(membershipsTable.userId, usersTable.id))
    .where(
      and(
        eq(membershipsTable.organizationId, organizationId),
        eq(membershipsTable.channelType, channelType),
        eq(membershipsTable.channelId, channelId),
        inArray(usersTable.id, readable),
        after ? gt(usersTable.id, after) : undefined,
      ),
    )
    .orderBy(asc(usersTable.id))
    .limit(limit);
}

export async function insertLtiResourceLink(ctx: DbContext, { values }: { values: typeof ltiResourceLinksTable.$inferInsert }) {
  const [inserted] = await ctx.var.db.insert(ltiResourceLinksTable).values(values).returning();
  return inserted;
}

export async function updateLtiResourceLink(
  ctx: DbContext,
  {
    id,
    values,
  }: { id: string; values: Partial<Pick<typeof ltiResourceLinksTable.$inferInsert, 'title' | 'custom' | 'enabled' | 'updatedAt' | 'updatedBy'>> },
) {
  const [updated] = await ctx.var.db.update(ltiResourceLinksTable).set(values).where(eq(ltiResourceLinksTable.id, id)).returning();
  return updated;
}

export async function deleteLtiResourceLink(ctx: DbContext, { id }: { id: string }) {
  await ctx.var.db.delete(ltiResourceLinksTable).where(eq(ltiResourceLinksTable.id, id));
}

/** A resource link with the installation it launches and that installation's registration; undefined when either is gone. */
export async function findLtiLaunchTarget(ctx: DbContext, { resourceLinkId }: { resourceLinkId: string }) {
  const [found] = await ctx.var.db
    .select({ resourceLink: ltiResourceLinksTable, ...installationSelect })
    .from(ltiResourceLinksTable)
    .innerJoin(
      serviceAccountsTable,
      and(eq(serviceAccountsTable.id, ltiResourceLinksTable.installationId), eq(serviceAccountsTable.tenantId, ltiResourceLinksTable.tenantId)),
    )
    .innerJoin(ltiInstallationsTable, eq(ltiInstallationsTable.serviceAccountId, serviceAccountsTable.id))
    .innerJoin(oauthClientsTable, eq(oauthClientsTable.id, serviceAccountsTable.oauthClientId))
    .where(and(eq(ltiResourceLinksTable.id, resourceLinkId), isNotNull(ltiToolConfig)));
  return found;
}

/** An LTI registration by its `client_id`, with the addresses a launch may go to; undefined for any other client. */
export async function findLtiRegistration(ctx: DbContext, { clientId }: { clientId: string }) {
  const [found] = await ctx.var.db
    .select(installationSelect.client)
    .from(oauthClientsTable)
    .where(and(eq(oauthClientsTable.id, clientId), isNotNull(ltiToolConfig)));
  return found;
}
