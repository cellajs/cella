import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { invalidateCredentialCacheByAccount } from '#/middlewares/guard/credential-cache';
import { loadManagedServiceAccount } from '#/modules/service-accounts/helpers/managed-service-account';
import { revokeCredential } from '#/modules/service-accounts/service-accounts-queries';
import { getIsoDate } from '#/utils/iso-date';
import { log } from '#/utils/logger';

/** The row stays for the audit trail; the key stops authenticating within the cache window. */
export async function revokeCredentialOp(ctx: UserContext, serviceAccountId: string, credentialId: string) {
  const account = await loadManagedServiceAccount(ctx, serviceAccountId);
  const revoked = await revokeCredential(ctx, {
    principalId: account.id,
    id: credentialId,
    revokedAt: getIsoDate(),
    revokedBy: ctx.var.actor.id,
  });
  if (!revoked) throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'credential' } });
  invalidateCredentialCacheByAccount(account.id);
  log.info('Credential revoked', { credentialId, serviceAccountId: account.id });
  return revoked;
}
