import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import type { DbContext } from '#/core/context';
import { tokensTable } from '#/modules/auth/tokens-db';
import { bindInactiveMemberships, deleteInvitationTokens } from '#/modules/memberships/memberships-queries';

interface ClaimEmailForUserOpts {
  userId: string;
  email: string;
}

/**
 * Binds every pending invitation addressed to `email` to the user, then deletes the invitation tokens:
 * a bound invitation is answered in-app, so the emailed link has no further use. Idempotent.
 */
export const claimEmailForUser = async (ctx: DbContext, { userId, email }: ClaimEmailForUserOpts) => {
  const { db } = ctx.var;

  const pendingTokens = await db
    .select({ inactiveMembershipId: tokensTable.inactiveMembershipId })
    .from(tokensTable)
    .where(
      and(
        eq(tokensTable.email, email),
        eq(tokensTable.type, 'invitation'),
        isNull(tokensTable.userId),
        isNotNull(tokensTable.inactiveMembershipId),
      ),
    );

  const inactiveMembershipIds = [...new Set(pendingTokens.flatMap((t) => t.inactiveMembershipId ?? []))];
  if (!inactiveMembershipIds.length) return [];

  await bindInactiveMemberships(ctx, { ids: inactiveMembershipIds, userId });
  await deleteInvitationTokens(ctx, { inactiveMembershipIds });

  return inactiveMembershipIds;
};
