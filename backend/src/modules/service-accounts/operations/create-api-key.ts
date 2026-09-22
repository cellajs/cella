import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { invalidateApiKeyCacheByAccount } from '#/middlewares/guard/api-key-cache';
import { issueApiKey } from '#/modules/service-accounts/helpers/issue-api-key';
import { loadManagedServiceAccount } from '#/modules/service-accounts/helpers/managed-service-account';
import { countLiveApiKeys, expireApiKey } from '#/modules/service-accounts/service-accounts-queries';
import type { CreateApiKeyInput } from '#/modules/service-accounts/service-accounts-schema';
import { assertTenantQuota } from '#/modules/tenants/tenant-restrictions';
import { log } from '#/utils/logger';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Issues a key; with `rollFrom`, the predecessor keeps working for the overlap window so the caller can deploy the new
 * key first. The plaintext is in the response once and nowhere else.
 */
export async function createApiKeyOp(ctx: UserContext, serviceAccountId: string, input: CreateApiKeyInput) {
  const account = await loadManagedServiceAccount(ctx, serviceAccountId);
  assertTenantQuota(ctx, 'apiKey', await countLiveApiKeys(ctx, { tenantId: ctx.var.tenantId }));

  // The predecessor is checked before the new key exists, and both writes land or neither does: a bad `rollFrom`
  // never leaves an orphan live key whose plaintext nobody received.
  const issued = await ctx.var.db.transaction(async (tx) => {
    const txCtx = { var: { db: tx } };
    if (input.rollFrom) {
      const expiresAt = new Date(Date.now() + input.rollOverlapDays * DAY_MS).toISOString();
      const rolled = await expireApiKey(txCtx, { principalId: account.id, id: input.rollFrom, expiresAt });
      if (!rolled) throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'apiKey' } });
      log.info('ApiKey rolled', { from: input.rollFrom, overlapEnd: expiresAt });
    }
    return issueApiKey(tx, {
      principalId: account.id,
      tenantId: ctx.var.tenantId,
      name: input.name,
      description: input.description,
      scopes: input.scopes ?? null,
      expiresAt: input.expiresAt,
      createdBy: ctx.var.actor.id,
    });
  });

  invalidateApiKeyCacheByAccount(account.id);
  log.info('ApiKey issued', { keyId: issued.apiKey.id, serviceAccountId: account.id });
  return { ...issued.apiKey, secret: issued.secret };
}
