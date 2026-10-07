import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { generateApiKey } from '#/modules/service-accounts/helpers/api-key';
import {
  countLiveApiKeys,
  findServiceAccountInTenant,
  insertApiKey,
  scheduleApiKeyExpiry,
} from '#/modules/service-accounts/service-accounts-queries';
import type { CreateApiKeyInput } from '#/modules/service-accounts/service-accounts-schema';
import { assertTenantQuota } from '#/modules/tenants/tenant-restrictions';
import { getValidChannel } from '#/permissions';
import { log } from '#/utils/logger';
import { withApiKeyCreator } from './with-api-key-creators';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Issues a key; with `rollFrom`, the predecessor keeps working for the overlap window so the caller can deploy the new
 * key first. The plaintext is in the response once and nowhere else.
 */
export async function createApiKeyOp(ctx: UserContext, serviceAccountId: string, input: CreateApiKeyInput) {
  const { tenantId } = ctx.var;
  await getValidChannel(ctx, ctx.var.organizationId, 'organization', 'update');
  const account = await findServiceAccountInTenant(ctx, { id: serviceAccountId, tenantId });
  if (!account) throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'serviceAccount' } });
  assertTenantQuota(ctx, 'apiKey', await countLiveApiKeys(ctx, { tenantId }));

  // The predecessor is checked before the new key exists, and both writes land or neither does: a bad `rollFrom`
  // never leaves an orphan live key whose plaintext nobody received.
  const { key: secret, parsed } = generateApiKey('secret');
  const apiKey = await ctx.var.db.transaction(async (tx) => {
    const txCtx = { var: { db: tx } };
    if (input.rollFrom) {
      const expiresAt = new Date(Date.now() + input.rollOverlapDays * DAY_MS).toISOString();
      const rolled = await scheduleApiKeyExpiry(txCtx, { actorId: account.id, id: input.rollFrom, expiresAt });
      if (!rolled) throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'apiKey' } });
      log.info('ApiKey rolled', { from: input.rollFrom, overlapEnd: expiresAt });
    }
    return insertApiKey(txCtx, {
      values: {
        actorId: account.id,
        tenantId,
        name: input.name,
        scopes: input.scopes ?? null,
        expiresAt: input.expiresAt,
        createdBy: ctx.var.actor.id,
        ...parsed,
      },
    });
  });
  invalidateCache.serviceAccount(account);

  log.info('ApiKey issued', { keyId: apiKey.id, serviceAccountId: account.id });
  return { ...(await withApiKeyCreator(ctx, apiKey)), secret };
}
