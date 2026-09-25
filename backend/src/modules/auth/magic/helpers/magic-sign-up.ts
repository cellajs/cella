import { appConfig } from 'shared';
import { AppError } from '#/core/error';
import type { Tx } from '#/db/db';
import { hasPendingInvitation } from '#/modules/auth/auth-queries';
import { requireEmailVerified } from '#/modules/auth/general/helpers/mark-email-verified';
import { handleCreateUser } from '#/modules/auth/general/helpers/user';
import type { TokenRecord } from '#/modules/auth/tokens/tokens-queries';
import { findUserByEmail } from '#/modules/user/user-queries';
import { log } from '#/utils/logger';
import { slugFromEmail } from '#/utils/slug-from-email';

/**
 * The account a sign-up link signs in to, settled in the transaction that redeems it: the account that holds the
 * address by now, or a new one. The click proves the inbox, so a new account starts with its address verified via
 * `magic` and claims the invitations waiting for it. Registration is checked again, since it may have closed, or the
 * invitation that allowed the sign-up may have gone, after the link went out.
 * @throws AppError 403 `sign_up_restricted` when the address may no longer sign up.
 */
export const claimMagicLinkOwner = async (tx: Tx, token: TokenRecord): Promise<string> => {
  const txCtx = { var: { db: tx } };

  const holder = await findUserByEmail(txCtx, { email: token.email });
  if (holder) return holder.id;

  const mayRegister = appConfig.has.selfRegistration || (await hasPendingInvitation(txCtx, { email: token.email }));
  if (!mayRegister) throw new AppError(403, 'sign_up_restricted', 'info');

  const slug = slugFromEmail(token.email);
  const user = await handleCreateUser(txCtx, {
    newUser: { email: token.email, slug, name: slug, firstName: slug },
    emailVerified: false,
  });
  await requireEmailVerified(tx, { userId: user.id, email: token.email, via: 'magic' });

  log.info('User created via magic link sign-up', { userId: user.id });
  return user.id;
};
