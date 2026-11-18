import { and, desc, eq, getColumns, isNotNull, sql } from 'drizzle-orm';
import { hierarchy } from 'shared';
import type { DbContext } from '#/core/context';
import type { ActorId } from '#/db/utils/ids';
import { updateStamps } from '#/db/utils/stamps';
import { type LtiReleasableField, ltiInstallationsTable } from '#/modules/lti-platform/lti-installations-db';
import type { LtiToolConfig } from '#/modules/lti-platform/lti-platform-schema';
import { ltiResourceLinksTable } from '#/modules/lti-platform/lti-resource-links-db';
import { oauthClientsTable } from '#/modules/oauth-server/oauth-clients-db';
import { serviceAccountsTable } from '#/modules/service-accounts/service-accounts-db';
import { insertServiceAccount, updateServiceAccount } from '#/modules/service-accounts/service-accounts-queries';

const { secretHash: _secretHash, ltiToolConfig, initiateLoginUri, ...clientColumns } = getColumns(oauthClientsTable);

/**
 * An installation with its service account and its registration; the where clause keeps LTI registrations only, whose
 * login address `oauth_clients_lti_check` holds present.
 */
const installationSelect = {
  account: serviceAccountsTable,
  installation: ltiInstallationsTable,
  client: { ...clientColumns, ltiToolConfig: sql<LtiToolConfig>`${ltiToolConfig}`, initiateLoginUri: sql<string>`${initiateLoginUri}` },
};

const installationJoin = (ctx: DbContext) =>
  ctx.var.db
    .select(installationSelect)
    .from(serviceAccountsTable)
    .innerJoin(ltiInstallationsTable, eq(ltiInstallationsTable.serviceAccountId, serviceAccountsTable.id))
    .innerJoin(oauthClientsTable, eq(oauthClientsTable.id, serviceAccountsTable.oauthClientId));

/** An installation as the platform reads it: the service account, its LTI side row and the registration. */
export type LtiInstallationRecord = Awaited<ReturnType<typeof findLtiInstallations>>[number];

/** The tenant's LTI installations, newest first. */
export async function findLtiInstallations(ctx: DbContext, { tenantId }: { tenantId: string }) {
  return installationJoin(ctx)
    .where(and(eq(serviceAccountsTable.tenantId, tenantId), isNotNull(ltiToolConfig)))
    .orderBy(desc(ltiInstallationsTable.createdAt), desc(ltiInstallationsTable.serviceAccountId));
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
  by: ActorId;
}

/**
 * Approves an installation inside the caller's transaction: its service account turns active and its side row records
 * the released fields and the approval, both stamped by `by`.
 * @returns What the two rows were set to.
 */
export async function approveLtiInstallation(ctx: DbContext, { id, tenantId, releasedFields, by }: ApproveLtiInstallationOpts) {
  const stamps = updateStamps(by);
  const decision = { releasedFields: [...new Set(releasedFields)], approvedAt: stamps.updatedAt, approvedBy: stamps.updatedBy, ...stamps };
  await updateServiceAccount(ctx, { id, tenantId, values: { status: 'active', ...stamps } });
  await ctx.var.db.update(ltiInstallationsTable).set(decision).where(eq(ltiInstallationsTable.serviceAccountId, id));
  return { stamps, decision };
}

/** Deletes a registration private to the tenant. The service account that installs it and its side row cascade. */
export async function deleteTenantLtiRegistration(ctx: DbContext, { id, tenantId }: { id: string; tenantId: string }) {
  await ctx.var.db.delete(oauthClientsTable).where(and(eq(oauthClientsTable.id, id), eq(oauthClientsTable.tenantId, tenantId)));
}

/** The resource links placed in one channel of the tenant, oldest first: the order their tabs show in. */
export async function findLtiResourceLinks(ctx: DbContext, { tenantId, channelId }: { tenantId: string; channelId: string }) {
  return ctx.var.db
    .select()
    .from(ltiResourceLinksTable)
    .where(and(eq(ltiResourceLinksTable.tenantId, tenantId), eq(ltiResourceLinksTable.channelId, channelId)))
    .orderBy(ltiResourceLinksTable.createdAt, ltiResourceLinksTable.id);
}

/** One resource link of the organization; undefined when it has none of that id. */
export async function findLtiResourceLink(ctx: DbContext, { id, organizationId }: { id: string; organizationId: string }) {
  const [found] = await ctx.var.db
    .select()
    .from(ltiResourceLinksTable)
    .where(and(eq(ltiResourceLinksTable.id, id), eq(ltiResourceLinksTable.organizationId, organizationId)));
  return found;
}

export async function insertLtiResourceLink(ctx: DbContext, { values }: { values: typeof ltiResourceLinksTable.$inferInsert }) {
  const [inserted] = await ctx.var.db.insert(ltiResourceLinksTable).values(values).returning();
  return inserted;
}

export async function updateLtiResourceLink(
  ctx: DbContext,
  { id, values }: { id: string; values: Partial<Pick<typeof ltiResourceLinksTable.$inferInsert, 'title' | 'custom' | 'updatedAt' | 'updatedBy'>> },
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
