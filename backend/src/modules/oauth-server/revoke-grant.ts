import type { DbContext } from '#/core/context';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { deleteConsentWithTokens, deleteGrant } from '#/modules/oauth-server/oauth-server-queries';

interface RevokeGrantOpts {
  grantId: string;
  /** False when the provider deletes the grant's tokens itself, alongside this; default true. */
  withTokens?: boolean;
}

/**
 * Deletes a grant, with every token issued under it unless the provider deletes those itself. Its access tokens stop at
 * their next request in every process: the guards read the grant at every use.
 * @param ctx - Any context with a database.
 * @param opts - The grant, and whether its tokens go with it.
 */
export async function revokeGrant(ctx: DbContext, { grantId, withTokens = true }: RevokeGrantOpts): Promise<void> {
  const accountId = await ctx.var.db.transaction(async (tx) => {
    const txCtx = { var: { db: tx } };
    return withTokens ? await deleteConsentWithTokens(txCtx, { grantId }) : await deleteGrant(txCtx, { grantId });
  });
  if (accountId) invalidateCache.grant(accountId, grantId);
}
