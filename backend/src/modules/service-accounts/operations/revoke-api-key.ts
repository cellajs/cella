import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { findServiceAccountInTenant, revokeApiKey } from '#/modules/service-accounts/service-accounts-queries';
import { getValidChannel } from '#/permissions';
import { getIsoDate } from '#/utils/iso-date';
import { log } from '#/utils/logger';

/** The row stays for the audit trail; the key and the tokens minted with it stop in every process with the commit. */
export async function revokeApiKeyOp(ctx: UserContext, serviceAccountId: string, keyId: string) {
  await getValidChannel(ctx, ctx.var.organizationId, 'organization', 'update');
  const account = await findServiceAccountInTenant(ctx, { id: serviceAccountId, tenantId: ctx.var.tenantId });
  if (!account) throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'serviceAccount' } });
  const revoked = await revokeApiKey(ctx, { actorId: account.id, id: keyId, revokedAt: getIsoDate(), revokedBy: ctx.var.actor.id });
  if (!revoked) throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'apiKey' } });
  invalidateCache.serviceAccount(account);
  log.info('ApiKey revoked', { keyId, serviceAccountId: account.id });
  return revoked;
}
