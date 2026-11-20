import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { withActorRef } from '#/modules/actors/actor-refs';
import { getManagedServiceAccount } from '#/modules/service-accounts/operations/get-managed-service-account';
import { issueApiKey } from '#/modules/service-accounts/operations/issue-api-key';
import { countLiveApiKeys, scheduleApiKeyExpiry } from '#/modules/service-accounts/service-accounts-queries';
import type { ApiKeyInput, CreateApiKeyInput } from '#/modules/service-accounts/service-accounts-schema';
import { assertTenantQuota } from '#/modules/tenants/tenant-restrictions';
import { isoDateIn } from '#/utils/iso-date';
import { log } from '#/utils/logger';
import { TimeSpan } from '#/utils/time-span';

/**
 * Issues a key; with `rollFrom`, a successor with the predecessor's scopes and expiry, while the predecessor keeps
 * working for the overlap window so the caller can deploy the new key first. The plaintext is in the response once and
 * nowhere else.
 */
export async function createApiKeyOp(ctx: UserContext, serviceAccountId: string, input: CreateApiKeyInput) {
  const { tenantId } = ctx.var;
  const account = await getManagedServiceAccount(ctx, serviceAccountId);
  assertTenantQuota(ctx, 'apiKey', await countLiveApiKeys(ctx, { tenantId }));

  // The predecessor is checked before the new key exists, and both writes commit or neither does: a bad `rollFrom`
  // never leaves an orphan live key whose plaintext nobody received.
  const { apiKey, secret } = await ctx.var.db.transaction(async (tx) => {
    const txCtx = { var: { db: tx } };
    if (!('rollFrom' in input)) return issueApiKey(txCtx, { account, createdBy: ctx.var.actor.id, key: input });

    const overlapEnd = isoDateIn(new TimeSpan(input.rollOverlapDays, 'd'));
    const rolled = await scheduleApiKeyExpiry(txCtx, { actorId: account.id, id: input.rollFrom, expiresAt: overlapEnd });
    if (!rolled) throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'apiKey' } });
    log.info('ApiKey rolled', { from: input.rollFrom, overlapEnd });
    const key: ApiKeyInput = { name: input.name, scopes: rolled.scopes ?? 'all', expiresAt: rolled.expiresAt ?? undefined };
    return issueApiKey(txCtx, { account, createdBy: ctx.var.actor.id, key });
  });
  invalidateCache.serviceAccount(account);

  log.info('ApiKey issued', { keyId: apiKey.id, serviceAccountId: account.id });
  return { ...(await withActorRef(ctx, apiKey)), secret };
}
