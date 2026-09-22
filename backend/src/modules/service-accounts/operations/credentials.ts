import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { issueCredential } from '#/modules/service-accounts/helpers/issue-credential';
import {
  countLiveCredentials,
  expireCredential,
  findCredentialsByPrincipal,
  findServiceAccountInTenant,
  requireOrgAdmin,
  revokeCredential,
} from '#/modules/service-accounts/service-accounts-queries';
import type { CreateCredentialInput } from '#/modules/service-accounts/service-accounts-schema';
import { assertTenantQuota } from '#/modules/tenants/tenant-restrictions';
import { getIsoDate } from '#/utils/iso-date';
import { log } from '#/utils/logger';

const DAY_MS = 24 * 60 * 60 * 1000;

export async function getCredentialsOp(ctx: UserContext, serviceAccountId: string) {
  await requireOrgAdmin(ctx);
  const account = await findServiceAccountInTenant(ctx, serviceAccountId);
  return { items: await findCredentialsByPrincipal(ctx, account.id) };
}

/**
 * Issues a key; with `rollFrom`, the predecessor keeps working for the overlap window so the caller can deploy the new
 * key first. The plaintext is in the response once and nowhere else.
 */
export async function createCredentialOp(ctx: UserContext, serviceAccountId: string, input: CreateCredentialInput) {
  await requireOrgAdmin(ctx);
  const account = await findServiceAccountInTenant(ctx, serviceAccountId);
  assertTenantQuota(ctx, 'credential', await countLiveCredentials(ctx));

  // The predecessor is checked before the new key exists, and both writes land or neither does: a bad `rollFrom`
  // never leaves an orphan live key whose plaintext nobody received.
  const issued = await ctx.var.db.transaction(async (tx) => {
    if (input.rollFrom) {
      const overlapEnd = new Date(Date.now() + input.rollOverlapDays * DAY_MS).toISOString();
      const rolled = await expireCredential(tx, { principalId: account.id, id: input.rollFrom, expiresAt: overlapEnd });
      if (!rolled) throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'credential' } });
      log.info('Credential rolled', { from: input.rollFrom, overlapEnd });
    }
    return issueCredential(tx, {
      principalId: account.id,
      tenantId: ctx.var.tenantId,
      name: input.name,
      description: input.description,
      scopes: input.scopes ?? null,
      expiresAt: input.expiresAt,
      createdBy: ctx.var.actor.id,
    });
  });

  log.info('Credential issued', { credentialId: issued.credential.id, serviceAccountId: account.id });
  return { ...issued.credential, secret: issued.secret };
}

export async function revokeCredentialOp(ctx: UserContext, serviceAccountId: string, credentialId: string) {
  await requireOrgAdmin(ctx);
  const account = await findServiceAccountInTenant(ctx, serviceAccountId);
  const revoked = await revokeCredential(ctx.var.db, {
    principalId: account.id,
    id: credentialId,
    revokedAt: getIsoDate(),
  });
  if (!revoked) throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'credential' } });
  log.info('Credential revoked', { credentialId, serviceAccountId: account.id });
  return revoked;
}
