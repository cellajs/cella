import { and, desc, eq, getColumns, isNotNull, sql } from 'drizzle-orm';
import { hierarchy } from 'shared';
import type { DbContext } from '#/core/context';
import { type LtiInstallationModel, ltiInstallationsTable } from '#/modules/lti-platform/lti-installations-db';
import type { LtiToolConfig } from '#/modules/lti-platform/lti-platform-schema';
import { oauthClientsTable } from '#/modules/oauth-server/oauth-clients-db';
import { serviceAccountsTable } from '#/modules/service-accounts/service-accounts-db';
import { insertServiceAccount } from '#/modules/service-accounts/service-accounts-queries';

const { secretHash: _secretHash, ltiToolConfig, ...clientColumns } = getColumns(oauthClientsTable);

/** An installation with its service account and its registration; the where clause keeps LTI registrations only. */
const installationSelect = {
  account: serviceAccountsTable,
  installation: ltiInstallationsTable,
  client: { ...clientColumns, ltiToolConfig: sql<LtiToolConfig>`${ltiToolConfig}` },
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
    .orderBy(desc(ltiInstallationsTable.createdAt));
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

/** Sets an installation's LTI side row; undefined when it has none. */
export async function updateLtiInstallation(
  ctx: DbContext,
  {
    serviceAccountId,
    values,
  }: { serviceAccountId: string; values: Partial<Omit<LtiInstallationModel, 'serviceAccountId' | 'createdAt' | 'createdBy'>> },
) {
  const [installation] = await ctx.var.db
    .update(ltiInstallationsTable)
    .set(values)
    .where(eq(ltiInstallationsTable.serviceAccountId, serviceAccountId))
    .returning();
  return installation;
}

/** Deletes a registration private to the tenant. The service account that installs it and its side row cascade. */
export async function deleteTenantLtiRegistration(ctx: DbContext, { id, tenantId }: { id: string; tenantId: string }) {
  await ctx.var.db.delete(oauthClientsTable).where(and(eq(oauthClientsTable.id, id), eq(oauthClientsTable.tenantId, tenantId)));
}
