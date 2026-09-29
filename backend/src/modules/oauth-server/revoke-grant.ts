import type { DbContext } from '#/core/context';
import { type AuthInvalidation, dropCachedAuth, publishAuthInvalidation } from '#/middlewares/guard/invalidate-cache';
import { deleteConsentWithTokens, deleteGrant } from '#/modules/oauth-server/oauth-server-queries';

interface RevokeGrantOpts {
  grantId: string;
  /** False when the provider deletes the grant's tokens itself, alongside this; default true. */
  withTokens?: boolean;
}

/**
 * Deletes a grant, with every token issued under it unless the provider deletes those itself, and stops its access
 * tokens: the verdicts on them drop here at once, and in every other process through `auth_invalidate` when the
 * delete commits.
 * @param ctx - Any context with a database.
 * @param opts - The grant, and whether its tokens go with it.
 */
export async function revokeGrant(ctx: DbContext, { grantId, withTokens = true }: RevokeGrantOpts): Promise<void> {
  const revoked = await ctx.var.db.transaction(async (tx) => {
    const txCtx = { var: { db: tx } };
    const accountId = withTokens
      ? await deleteConsentWithTokens(txCtx, { grantId })
      : await deleteGrant(txCtx, { grantId });
    if (!accountId) return null;
    const invalidation: AuthInvalidation = { grant: { accountId, grantId } };
    await publishAuthInvalidation(tx, invalidation);
    return invalidation;
  });
  if (revoked) dropCachedAuth(revoked);
}
