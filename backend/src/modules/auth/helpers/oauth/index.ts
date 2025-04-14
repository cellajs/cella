import { and, eq, or } from 'drizzle-orm';
import type { Context } from 'hono';
import { oauthAccountsTable } from '#/db/schema/oauth-accounts';
import { type UserModel, usersTable } from '#/db/schema/users';
import { setUserSession } from '../session';

import { type EnabledOauthProvider, config } from 'config';
import { db } from '#/db/db';
import { emailsTable } from '#/db/schema/emails';
import { tokensTable } from '#/db/schema/tokens';
import { errorRedirect } from '#/lib/errors';
import { getUsersByConditions } from '#/modules/users/helpers/get-user-by';
import { isRedirectUrl } from '#/utils/is-redirect-url';
import { getIsoDate } from '#/utils/iso-date';
import { getAuthCookie } from '../cookie';
import { sendVerificationEmail } from '../verify-email';
import type { Provider } from './oauth-providers';
import type { TransformedUser } from './transform-user-data';

// Get redirect URL from cookie or use default
export const getOauthRedirectUrl = async (ctx: Context, firstSignIn?: boolean) => {
  const redirectCookie = await getAuthCookie(ctx, 'oauth_redirect');

  const baseRedirect = redirectCookie || (firstSignIn && config.welcomeRedirectPath) || config.defaultRedirectPath;

  return isRedirectUrl(baseRedirect) ? baseRedirect : `${config.frontendUrl}${baseRedirect}`;
};

export const handleExistingUser = async (
  ctx: Context,
  existingUser: UserModel,
  transformedUser: TransformedUser,
  provider: Provider,
  connectUserId: string | null,
  redirectUrl: string,
  emailVerified: boolean,
) => {
  // Check if the user has a linked OAuth account
  const [existingOauth] = await db
    .select()
    .from(oauthAccountsTable)
    .where(and(eq(oauthAccountsTable.providerUserId, provider.userId), eq(oauthAccountsTable.providerId, provider.id)));

  // Update the existing user if OAuth is not yet linked
  if (!existingOauth) {
    const { slug, name, emailVerified: transformVerified, ...providerUser } = transformedUser;
    return await updateExistingUser(ctx, existingUser, provider.id, { providerUser, redirectUrl, emailVerified });
  }

  // Ensure the correct user is linking their account
  if (existingOauth && connectUserId && existingOauth.userId !== connectUserId) {
    return errorRedirect(ctx, 'oauth_mismatch', 'warn');
  }

  // Set the user session and redirect
  await setUserSession(ctx, existingUser.id, provider.id);
  return ctx.redirect(redirectUrl, 302);
};

interface Params {
  providerUser: Pick<UserModel, 'thumbnailUrl' | 'firstName' | 'lastName' | 'id' | 'email'>;
  emailVerified: boolean;
  redirectUrl: string;
}

/**
 * Update existing user
 *
 * @param ctx - Request/response context
 * @param existingUser - Existing user model
 * @param providerId - OAuth provider ID
 * @param params - Parameters for updating the user
 */
const updateExistingUser = async (ctx: Context, existingUser: UserModel, providerId: EnabledOauthProvider, params: Params) => {
  const { providerUser, emailVerified, redirectUrl } = params;

  await db.insert(oauthAccountsTable).values({ providerId, providerUserId: providerUser.id, userId: existingUser.id });

  // Update user with auth provider data if not already present
  await db
    .update(usersTable)
    .set({
      thumbnailUrl: existingUser.thumbnailUrl || providerUser.thumbnailUrl,
      firstName: existingUser.firstName || providerUser.firstName,
      lastName: existingUser.lastName || providerUser.lastName,
    })
    .where(eq(usersTable.id, existingUser.id));

  // Send verification email if not verified and redirect to verify page
  if (!emailVerified) {
    sendVerificationEmail(providerUser.id);
    return ctx.redirect(`${config.frontendUrl}/auth/email-verification`, 302);
  }

  await db
    .insert(emailsTable)
    .values({ email: providerUser.email, userId: existingUser.id, verified: true, verifiedAt: getIsoDate() })
    .onConflictDoUpdate({
      target: emailsTable.email,
      set: { userId: existingUser.id, verifiedAt: getIsoDate(), verified: true },
    });

  // Sign in user
  await setUserSession(ctx, existingUser.id, providerId);

  return ctx.redirect(redirectUrl, 302);
};

/**
 * Find existing users based on their email, user ID, or token ID.
 * This utility checks if a user already exists in the system based on one or more conditions.
 *
 * @param email - Email of  user to search for.
 * @param userId - User ID to search for (optional).
 * @param tokenId - Invite token ID to search for (optional).
 * @returns - Existing user or null if not found.
 */
export const findExistingUsers = async (email: string, userId: string | null, tokenId: string | null): Promise<UserModel[]> => {
  const tokenUserId = tokenId
    ? await db
        .select({ userId: tokensTable.userId })
        .from(tokensTable)
        .where(eq(tokensTable.id, tokenId))
        .then(([result]) => result.userId)
    : null;

  const conditions = or(
    eq(usersTable.email, email),
    ...(userId ? [eq(usersTable.id, userId)] : []),
    ...(tokenUserId ? [eq(usersTable.id, tokenUserId)] : []),
  );

  const existingUsers = await getUsersByConditions([conditions]);
  return existingUsers;
};
