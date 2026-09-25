import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { requireManagedServiceAccount } from '#/modules/service-accounts/helpers/managed-service-account';
import { revokeApiKey } from '#/modules/service-accounts/service-accounts-queries';
import { getIsoDate } from '#/utils/iso-date';
import { log } from '#/utils/logger';

/** The row stays for the audit trail; the key and the tokens minted with it stop in every process at once. */
export async function revokeApiKeyOp(ctx: UserContext, serviceAccountId: string, keyId: string) {
  const account = await requireManagedServiceAccount(ctx, serviceAccountId);
  const revoked = await revokeApiKey(ctx, {
    actorId: account.id,
    id: keyId,
    revokedAt: getIsoDate(),
    revokedBy: ctx.var.actor.id,
  });
  if (!revoked) throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'apiKey' } });
  invalidateCache.serviceAccount(account.id);
  log.info('ApiKey revoked', { keyId, serviceAccountId: account.id });
  return revoked;
}
