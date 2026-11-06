import type { Context } from 'hono';
import type { Env } from '#/core/context';
import { baseDb } from '#/db/db';
import { readMemberships } from '#/middlewares/guard/membership-cache';
import { findLiveBoundToken } from '#/modules/auth/tokens/token-lifecycle';
import { handleMembershipInvitationOp } from '#/modules/memberships/operations/handle-membership-invitation';
import type { UserModel } from '#/modules/user/user-db';
import { log } from '#/utils/logger';

/** A membership invitation whose emailed link this browser opened. */
export interface FollowedInvitation {
  inactiveMembershipId: string;
  /** The invited address, as the invitation's link holds it. */
  email: string;
}

/**
 * The membership invitation whose link this browser opened, named by the single-use cookie that opening set; null
 * without one, and for a system invitation, which has no membership to accept. Read it before the sign-in proves the
 * inbox: the claim that proof runs deletes the links of the invitations it binds.
 */
export const findFollowedInvitation = async (ctx: Context<Env>): Promise<FollowedInvitation | null> => {
  const token = await findLiveBoundToken(ctx, 'invitation');
  if (!token?.inactiveMembershipId) return null;
  return { inactiveMembershipId: token.inactiveMembershipId, email: token.email };
};

interface AcceptFollowedInvitationOpts {
  /** The address the sign-in proved: by a magic link or verification mail, or by the provider with the invitation link. */
  provenEmail: string;
  followed: FollowedInvitation | null;
}

/**
 * Accepts, at the sign-in that follows, the invitation whose emailed link was opened: in this browser, or in the one
 * that asked for the magic link. Only when the sign-in proved the invited address, the invitation is bound to `user`
 * (by that proof's claim or before) and no second factor still stands between the click and the session. A magic
 * link, an OAuth sign-up and its verification mail call it; a passkey never does, since its account held the address
 * before, so its invitation came without a link. Any other invitation, such as one the account claims by its address
 * alone, waits for an answer in the app. The accept is the Accept button's (`handleMembershipInvitationOp`); a refusal
 * or a failure leaves the invitation to that button and never fails the sign-in.
 */
export const acceptFollowedInvitation = async (user: UserModel, { provenEmail, followed }: AcceptFollowedInvitationOpts) => {
  if (!followed || user.mfaRequired || followed.email.toLowerCase() !== provenEmail.toLowerCase()) return;

  const { inactiveMembershipId } = followed;
  try {
    const { memberships } = await readMemberships(user.id);
    await handleMembershipInvitationOp({ var: { db: baseDb, user, memberships } }, inactiveMembershipId, 'accept');
  } catch (err) {
    log.warn('Followed invitation not accepted at sign-in', { err, userId: user.id, inactiveMembershipId });
  }
};
