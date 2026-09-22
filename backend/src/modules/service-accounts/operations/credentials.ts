import { and, count, desc, eq, getTableColumns, isNull } from 'drizzle-orm';
import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { credentialsTable } from '#/modules/service-accounts/credentials-db';
import { issueCredential } from '#/modules/service-accounts/helpers/issue-credential';
import { serviceAccountsTable } from '#/modules/service-accounts/service-accounts-db';
import type { CreateCredentialInput } from '#/modules/service-accounts/service-accounts-schema';
import { getValidChannel } from '#/permissions';
import { getIsoDate } from '#/utils/iso-date';
import { log } from '#/utils/logger';

const { hash: _hash, ...safeColumns } = getTableColumns(credentialsTable);

/** The account must exist in this tenant; the caller must administer the organization. */
async function requireAccount(ctx: UserContext, serviceAccountId: string) {
  const { db, tenantId, organizationId } = ctx.var;
  await getValidChannel(ctx, organizationId, 'organization', 'update');
  const [account] = await db
    .select()
    .from(serviceAccountsTable)
    .where(and(eq(serviceAccountsTable.id, serviceAccountId), eq(serviceAccountsTable.tenantId, tenantId)))
    .limit(1);
  if (!account) throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'serviceAccount' } });
  return account;
}

export async function getCredentialsOp(ctx: UserContext, serviceAccountId: string) {
  const account = await requireAccount(ctx, serviceAccountId);
  const items = await ctx.var.db
    .select(safeColumns)
    .from(credentialsTable)
    .where(eq(credentialsTable.principalId, account.id))
    .orderBy(desc(credentialsTable.createdAt));
  return { items };
}

/**
 * Issues a key; with `rollFrom`, the predecessor keeps working for the overlap window so the caller can deploy the new
 * key first. The plaintext is in the response once and nowhere else.
 */
export async function createCredentialOp(ctx: UserContext, serviceAccountId: string, input: CreateCredentialInput) {
  const account = await requireAccount(ctx, serviceAccountId);
  const { db, tenantId } = ctx.var;

  const quota = ctx.var.tenant.restrictions.quotas.credential;
  if (quota > 0) {
    const [{ value: existing }] = await db
      .select({ value: count() })
      .from(credentialsTable)
      .where(and(eq(credentialsTable.tenantId, tenantId), isNull(credentialsTable.revokedAt)));
    if (existing >= quota) throw new AppError(403, 'restrict_by_app', 'warn', { meta: { resource: 'credential' } });
  }

  const issued = await issueCredential(db, {
    principalId: account.id,
    tenantId,
    name: input.name,
    description: input.description,
    scopes: input.scopes ?? null,
    expiresAt: input.expiresAt,
    createdBy: ctx.var.actor.id,
  });

  if (input.rollFrom) {
    const overlapEnd = new Date(Date.now() + input.rollOverlapDays * 24 * 60 * 60 * 1000).toISOString();
    const [rolled] = await db
      .update(credentialsTable)
      .set({ expiresAt: overlapEnd })
      .where(
        and(
          eq(credentialsTable.id, input.rollFrom),
          eq(credentialsTable.principalId, account.id),
          isNull(credentialsTable.revokedAt),
        ),
      )
      .returning({ id: credentialsTable.id });
    if (!rolled) throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'credential' } });
    log.info('Credential rolled', { from: input.rollFrom, to: issued.credential.id, overlapEnd });
  }

  log.info('Credential issued', { credentialId: issued.credential.id, serviceAccountId: account.id });
  return { ...issued.credential, secret: issued.secret };
}

export async function revokeCredentialOp(ctx: UserContext, serviceAccountId: string, credentialId: string) {
  const account = await requireAccount(ctx, serviceAccountId);
  const [revoked] = await ctx.var.db
    .update(credentialsTable)
    .set({ revokedAt: getIsoDate() })
    .where(and(eq(credentialsTable.id, credentialId), eq(credentialsTable.principalId, account.id)))
    .returning(safeColumns);
  if (!revoked) throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'credential' } });
  log.info('Credential revoked', { credentialId, serviceAccountId: account.id });
  return revoked;
}
