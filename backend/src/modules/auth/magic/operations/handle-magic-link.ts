import type { Context } from 'hono';
import { buildNotificationPath } from 'shared/utils/notification-link';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import { finishSignIn } from '#/modules/auth/general/operations/finish-sign-in';
import { acceptFollowedInvitation, type FollowedInvitation } from '#/modules/auth/invitations/operations/accept-followed-invitation';
import { spendRedeemedLink } from '#/modules/auth/tokens/token-lifecycle';
import type { TokenRecord } from '#/modules/auth/tokens/tokens-queries';
import { markEmailVerified } from '#/modules/user/operations/email-proof';
import { findUserById } from '#/modules/user/user-queries';
import { log } from '#/utils/logger';

/** The sign-in reads and stamps on the base pool, whatever the route's context holds. */
const dbCtx = { var: { db: baseDb } };

/**
 * Signs in the user a redeemed magic link names, records that the click proved their inbox, and accepts the invitation
 * whose link this browser opened (`findFollowedInvitation`, read before the magic link was redeemed), else the one the
 * browser that asked for the link had opened. The finished sign-in spends the link, so no browser signs in from it
 * again, a second factor's challenge included: a failed challenge needs a new link.
 */
export const handleMagicLink = async (ctx: Context<Env>, token: TokenRecord, followed: FollowedInvitation | null) => {
  if (!token.userId) throw new AppError(500, 'server_error', 'error');

  const user = await findUserById(dbCtx, { id: token.userId });
  if (!user) throw new AppError(404, 'not_found', 'error', { entityType: 'user', meta: { userId: token.userId } });

  // Clicking a magic link proves email ownership. Sign-in is the point here, so a missing row is logged, not fatal.
  const verified = await markEmailVerified(dbCtx, { userId: user.id, email: token.email, via: 'magic' });
  if (!verified) log.error('Magic link address is not on the account', { userId: user.id });

  const asked = token.followedInvitationId ? { inactiveMembershipId: token.followedInvitationId, email: token.email } : null;
  const joined = await acceptFollowedInvitation(user, { provenEmail: token.email, followed: followed ?? asked });

  // A link requested with a path keeps it; a sign-in that joined a channel lands there
  const response = await finishSignIn(ctx, user, 'magic', token.redirectPath ?? (joined && buildNotificationPath(joined)));
  await spendRedeemedLink(token.id);
  return response;
};
