import { config, type EnabledOauthProvider } from 'config';
import { and, eq, or } from 'drizzle-orm';
import type { Context } from 'hono';
import { db } from '#/db/db';
import { emailsTable } from '#/db/schema/emails';
import { type OauthAccountsModel, oauthAccountsTable } from '#/db/schema/oauth-accounts';
import { tokensTable } from '#/db/schema/tokens';
import { type UserModel, usersTable } from '#/db/schema/users';
import { errorRedirect } from '#/lib/errors';
import { getUsersByConditions } from '#/modules/users/helpers/get-user-by';
import { isRedirectUrl } from '#/utils/is-redirect-url';
import { getAuthCookie } from '../cookie';
import { setUserSession } from '../session';
import { sendOauthVerificationEmail } from '../verify-email';
import type { Provider } from './oauth-providers';
import type { TransformedUser } from './transform-user-data';

// Get redirect URL from cookie or use default
export const getOauthRedirectUrl = async (ctx: Context, firstSignIn?: boolean) => {
  const redirectCookie = await getAuthCookie(ctx, 'oauth_redirect');

  const baseRedirect = redirectCookie || (firstSignIn && config.welcomeRedirectPath) || config.defaultRedirectPath;

  return isRedirectUrl(baseRedirect) ? baseRedirect : `${config.frontendUrl}${baseRedirect}`;
};

/**
 * Handle `existing user` during OAuth sign-in, basically there are two scenarios:
 * 1. The user has an `verified linked OAuth account` → Just login!
 * 2. The user has `not` a verified linked Oauth account yet → Link the account and verify it!
 *
 * @param ctx - Hono context.
 * @param existingUser - The existing user model.
 * @param userProfile - Transformed user profile data from the OAuth provider.
 * @param provider - The OAuth provider information.
 * @param connectUserId - Optional user ID to connect the OAuth account to.
 * @param redirectUrl - The URL to redirect to after handling the existing user.
 *
 * @returns - Redirects to the appropriate URL based on the user's OAuth account status.
 */
export const handleExistingUser = async (
  ctx: Context,
  existingUser: UserModel,
  userProfile: TransformedUser,
  provider: Provider,
  connectUserId: string | null,
  redirectUrl: string,
) => {
  // Fetch `linked oauth account`
  let [linkedOauthAccount] = await db
    .select()
    .from(oauthAccountsTable)
    .where(
      and(
        eq(oauthAccountsTable.providerUserId, provider.userId),
        eq(oauthAccountsTable.providerId, provider.id),
        eq(oauthAccountsTable.email, userProfile.email),
      ),
    );

  // Ensure `linked oauth account` user ID matches the given `connect user ID`
  if (linkedOauthAccount && connectUserId && linkedOauthAccount.userId !== connectUserId) {
    return errorRedirect(ctx, 'oauth_mismatch', 'warn');
  }

  // If no linked oauth account found, create a new one
  if (!linkedOauthAccount) {
    linkedOauthAccount = await createLinkedOauthAccount(provider.id, userProfile, existingUser);
  }

  // If no verified linked oauth account → Verify it! (don't update any user data before verification!)
  if (!linkedOauthAccount?.emailVerified) {
    sendOauthVerificationEmail(linkedOauthAccount.id);
    return ctx.redirect(`${config.frontendUrl}/auth/email-verification`, 302);
  }

  // Update user with OAuth provider data
  await updateExistingUser(existingUser, userProfile);

  // Set the user session and redirect
  await setUserSession(ctx, existingUser.id, provider.id);
  return ctx.redirect(redirectUrl, 302);
};

/**
 * Create a new linked OAuth account for an existing user.
 *
 * @param providerId - The ID of the OAuth provider.
 * @param userProfile - The transformed user profile data from the OAuth provider.
 * @param existingUser - The existing user model to link the OAuth account to.
 *
 * @returns - The newly created OAuth account model.
 */
export const createLinkedOauthAccount = async (
  providerId: EnabledOauthProvider,
  userProfile: TransformedUser,
  existingUser: UserModel,
): Promise<OauthAccountsModel> => {
  const [linkedOauthAccount] = await db
    .insert(oauthAccountsTable)
    .values({
      providerId,
      providerUserId: userProfile.id,
      userId: existingUser.id,
      email: userProfile.email,
      verified: userProfile.emailVerified,
    })
    .returning();

  return linkedOauthAccount;
};

/**
 * Update existing user with OAuth provider data.
 *
 * @param existingUser - The existing user model to update.
 * @param userProfile - The transformed user profile data from the OAuth provider.
 *
 * @returns - A promise that resolves when the user is updated.
 *
 */
const updateExistingUser = async (existingUser: UserModel, userProfile: Pick<UserModel, 'thumbnailUrl' | 'firstName' | 'lastName'>) => {
  await db
    .update(usersTable)
    .set({
      thumbnailUrl: existingUser.thumbnailUrl || userProfile.thumbnailUrl,
      firstName: existingUser.firstName || userProfile.firstName,
      lastName: existingUser.lastName || userProfile.lastName,
    })
    .where(eq(usersTable.id, existingUser.id));
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
    eq(emailsTable.email, email),
    ...(userId ? [eq(usersTable.id, userId)] : []),
    ...(tokenUserId ? [eq(usersTable.id, tokenUserId)] : []),
  );

  const existingUsers = await getUsersByConditions([conditions]);
  return existingUsers;
};
