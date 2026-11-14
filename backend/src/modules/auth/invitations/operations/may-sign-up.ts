import { appConfig } from 'shared';
import type { DbContext } from '#/core/context';
import { hasLiveSystemInvitationToken } from '#/modules/auth/tokens/tokens-queries';
import { findOpenInvitationByEmail } from '#/modules/memberships/invitations-queries';

interface SignUpEmailOpts {
  email: string;
}

/**
 * Whether the address was invited and the invitation still stands: a membership invitation not declined (it outlives
 * its emailed token), or a live system invitation token (a system invite has no membership row).
 */
export const hasPendingInvitation = async (ctx: DbContext, { email }: SignUpEmailOpts) => {
  if (await findOpenInvitationByEmail(ctx, { email })) return true;

  return hasLiveSystemInvitationToken(ctx, { email });
};

/**
 * Whether a new account may be created for the address: registration is open, or an invitation to it still stands.
 * Sign-ups check it again when they complete, since either may have changed after the sign-up started.
 */
export const maySignUp = async (ctx: DbContext, { email }: SignUpEmailOpts) => appConfig.has.selfRegistration || hasPendingInvitation(ctx, { email });
