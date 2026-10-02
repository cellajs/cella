import { appConfig } from 'shared';
import type { DbContext } from '#/core/context';
import { hasLiveInvitationToken } from '#/modules/auth/tokens/tokens-queries';
import { findPendingInactiveMembershipByEmail } from '#/modules/memberships/memberships-queries';

interface HasPendingInvitationOpts {
  email: string;
}

/**
 * Whether the address was invited and the invitation still stands: a membership invitation not rejected (it outlives
 * its emailed token), or a live invitation token (a system invite has no membership row).
 */
export const hasPendingInvitation = async (ctx: DbContext, { email }: HasPendingInvitationOpts) => {
  if (await findPendingInactiveMembershipByEmail(ctx, { email })) return true;

  return hasLiveInvitationToken(ctx, { email });
};

/**
 * Whether a new account may be created for the address: registration is open, or an invitation to it still stands.
 * Sign-ups check it again when they complete, since either may have changed after the sign-up started.
 */
export const maySignUp = async (ctx: DbContext, { email }: HasPendingInvitationOpts) =>
  appConfig.has.selfRegistration || hasPendingInvitation(ctx, { email });
