import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { deleteGrantWithTokens, findGrantOfAccount } from '#/modules/oauth-server/oauth-server-queries';
import { log } from '#/utils/logger';

/** Revoking a consent deletes the Grant and every token issued under it; the client must ask again. */
export async function revokeConnectedAppOp(ctx: UserContext, grantId: string) {
  const grant = await findGrantOfAccount(ctx, { grantId, accountId: ctx.var.user.id });
  if (!grant) throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'connectedApp' } });
  await deleteGrantWithTokens(ctx, { grantId });
  log.info('Connected app revoked', { grantId, userId: ctx.var.user.id });
  return { data: [] as [], rejectedIds: [] as string[] };
}
