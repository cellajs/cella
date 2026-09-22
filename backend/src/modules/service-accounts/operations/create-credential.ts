import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { invalidateCredentialCacheByAccount } from '#/middlewares/guard/credential-cache';
import { issueCredential } from '#/modules/service-accounts/helpers/issue-credential';
import { loadManagedServiceAccount } from '#/modules/service-accounts/helpers/managed-service-account';
import { countLiveCredentials, expireCredential } from '#/modules/service-accounts/service-accounts-queries';
import type { CreateCredentialInput } from '#/modules/service-accounts/service-accounts-schema';
import { assertTenantQuota } from '#/modules/tenants/tenant-restrictions';
import { log } from '#/utils/logger';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Issues a key; with `rollFrom`, the predecessor keeps working for the overlap window so the caller can deploy the new
 * key first. The plaintext is in the response once and nowhere else.
 */
export async function createCredentialOp(ctx: UserContext, serviceAccountId: string, input: CreateCredentialInput) {
  const account = await loadManagedServiceAccount(ctx, serviceAccountId);
  assertTenantQuota(ctx, 'credential', await countLiveCredentials(ctx, { tenantId: ctx.var.tenantId }));

  // The predecessor is checked before the new key exists, and both writes land or neither does: a bad `rollFrom`
  // never leaves an orphan live key whose plaintext nobody received.
  const issued = await ctx.var.db.transaction(async (tx) => {
    const txCtx = { var: { db: tx } };
    if (input.rollFrom) {
      const expiresAt = new Date(Date.now() + input.rollOverlapDays * DAY_MS).toISOString();
      const rolled = await expireCredential(txCtx, { principalId: account.id, id: input.rollFrom, expiresAt });
      if (!rolled) throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'credential' } });
      log.info('Credential rolled', { from: input.rollFrom, overlapEnd: expiresAt });
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

  invalidateCredentialCacheByAccount(account.id);
  log.info('Credential issued', { credentialId: issued.credential.id, serviceAccountId: account.id });
  return { ...issued.credential, secret: issued.secret };
}
