import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { deleteConsentWithTokens, findConsentOfUser } from '#/modules/oauth-server/oauth-server-queries';
import { log } from '#/utils/logger';

/**
 * Revoking a consent deletes the Grant and every token issued under it, and its tokens stop in every process at once;
 * the client must ask again.
 */
export async function revokeConnectedAppOp(ctx: UserContext, grantId: string) {
  const grant = await findConsentOfUser(ctx, { grantId, userId: ctx.var.user.id });
  if (!grant) throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'connectedApp' } });
  await deleteConsentWithTokens(ctx, { grantId });
  log.info('Connected app revoked', { grantId, userId: ctx.var.user.id });
  return { data: [] as [], rejectedIds: [] as string[] };
}
