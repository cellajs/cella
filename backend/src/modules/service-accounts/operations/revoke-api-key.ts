import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { requireManagedServiceAccount } from '#/modules/service-accounts/helpers/managed-service-account';
import { revokeApiKey } from '#/modules/service-accounts/service-accounts-queries';
import { getIsoDate } from '#/utils/iso-date';
import { log } from '#/utils/logger';

/** The row stays for the audit trail; the key and the tokens minted with it stop in every process with the commit. */
export async function revokeApiKeyOp(ctx: UserContext, serviceAccountId: string, keyId: string) {
  const account = await requireManagedServiceAccount(ctx, serviceAccountId);
  const revoked = await ctx.var.db.transaction(async (tx) => {
    const revoked = await revokeApiKey(
      { var: { db: tx } },
      { actorId: account.id, id: keyId, revokedAt: getIsoDate(), revokedBy: ctx.var.actor.id },
    );
    if (!revoked) throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'apiKey' } });
    await invalidateCache.serviceAccount(tx, account);
    return revoked;
  });
  log.info('ApiKey revoked', { keyId, serviceAccountId: account.id });
  return revoked;
}
