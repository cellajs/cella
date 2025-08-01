import { appConfig, type EnabledOAuthProvider } from 'config';
import { and, eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { db } from '#/db/db';
import { emailsTable } from '#/db/schema/emails';
import { type OAuthAccountModel, oauthAccountsTable } from '#/db/schema/oauth-accounts';
import { type TokenModel, tokensTable } from '#/db/schema/tokens';
import { type UserModel, usersTable } from '#/db/schema/users';
import { AppError } from '#/lib/errors';
import { getAuthCookie } from '#/modules/auth/helpers/cookie';
import type { Provider } from '#/modules/auth/helpers/oauth/oauth-providers';
import type { TransformedUser } from '#/modules/auth/helpers/oauth/transform-user-data';
import { sendVerificationEmail } from '#/modules/auth/helpers/send-verification-email';
import { setUserSession } from '#/modules/auth/helpers/session';
import { handleCreateUser } from '#/modules/auth/helpers/user';
import { getUsersByConditions } from '#/modules/users/helpers/get-user-by';
import { isValidRedirectPath } from '#/utils/is-redirect-url';

/**
 * Retrieves the OAuth redirect path from a cookie, or falls back to a default.
 *
 * @param ctx - The request context.
 * @returns A validated redirect path string.
 */
export const getOAuthRedirectPath = async (ctx: Context): Promise<string> => {
  const redirect = await getAuthCookie(ctx, 'oauth-redirect');

  return isValidRedirectPath(redirect) || appConfig.defaultRedirectPath;
};

/**
 * Handles the default OAuth login/signup flow.
 * Determines if the user has an existing verified/unverified account or needs to register.
 *
 * @param ctx - The request context.
 * @param providerUser - The transformed user data from the OAuth provider.
 * @param provider - The OAuth provider (e.g., 'google', 'github').
 * @param oauthAccount - The linked OAuth account, if one exists.
 * @returns A redirect response.
 */
export const basicFlow = async (
  ctx: Context,
  providerUser: TransformedUser,
  provider: EnabledOAuthProvider,
  oauthAccount: OAuthAccountModel | null = null,
): Promise<Response> => {
  // User already has a verified OAuth account → log them in
  if (oauthAccount?.verified) {
    const user = await getUserByOAuthAccount(oauthAccount);
    return await handleVerifiedOAuthAccount(ctx, user, oauthAccount);
  }

  // User has an unverified OAuth account → prompt email verification
  if (oauthAccount) {
    return await handleUnverifiedOAuthAccount(ctx, oauthAccount, 'signin');
  }

  // No linked OAuth account and more than one user with same email
  const users = await getUsersByConditions([eq(emailsTable.email, providerUser.email)]);
  if (users.length > 1) {
    throw new AppError({ status: 409, type: 'oauth_mismatch', severity: 'warn', isRedirect: true });
  }

  // One user match → link to new OAuth account and prompt email verification
  if (users.length === 1) {
    const newOAuthAccount = await createOAuthAccount(users[0].id, providerUser.id, provider, providerUser.email);

    return await handleUnverifiedOAuthAccount(ctx, newOAuthAccount, 'signin');
  }

  // No user found and registration is disabled
  if (!appConfig.has.registrationEnabled) {
    throw new AppError({ status: 403, type: 'sign_up_restricted', isRedirect: true });
  }

  // No user match → create a new user and OAuth account
  const user = await handleCreateUser({
    newUser: providerUser,
    membershipInviteTokenId: null,
    emailVerified: false,
  });

  const newOAuthAccount = await createOAuthAccount(user.id, providerUser.id, provider, providerUser.email);

  return await handleUnverifiedOAuthAccount(ctx, newOAuthAccount, 'signup');
};

/**
 * Handles connecting an OAuth provider to an existing user account.
 *
 * @param ctx - The request context.
 * @param providerUser - The transformed user data from the OAuth provider.
 * @param provider - The OAuth provider (e.g., 'google', 'github').
 * @param connectUserId - The ID of the user who is attempting to connect an OAuth account.
 * @param oauthAccount - The existing OAuth account, if one exists.
 * @returns A redirect response.
 */
export const connectFlow = async (
  ctx: Context,
  providerUser: TransformedUser,
  provider: EnabledOAuthProvider,
  connectUserId: string,
  oauthAccount: OAuthAccountModel | null = null,
): Promise<Response> => {
  if (oauthAccount) {
    // OAuth account is linked to a different user
    if (oauthAccount.userId !== connectUserId) {
      throw new AppError({ status: 409, type: 'oauth_mismatch', severity: 'warn', isRedirect: true });
    }

    // Already linked + verified → log in the user
    if (oauthAccount.verified) {
      const user = ctx.get('user') as UserModel;
      return await handleVerifiedOAuthAccount(ctx, user, oauthAccount);
    }

    // Linked but unverified → prompt verification
    return await handleUnverifiedOAuthAccount(ctx, oauthAccount, 'connect');
  }

  // New OAuth account connection → validate email isn't used by another user
  const users = await getUsersByConditions([eq(emailsTable.email, providerUser.email)]);
  if (users.some((u) => u.id !== connectUserId)) {
    throw new AppError({ status: 409, type: 'oauth_mismatch', severity: 'warn', isRedirect: true });
  }

  // Safe to connect → create and link OAuth account to current user
  const newOAuthAccount = await createOAuthAccount(connectUserId, providerUser.id, provider, providerUser.email);
  return await handleUnverifiedOAuthAccount(ctx, newOAuthAccount, 'connect');
};

/**
 * Handles user sign-up via invitation flow.
 * Validates the invitation token, checks email matches, and creates an OAuth account.
 *
 * @param ctx - The request context.
 * @param providerUser - The transformed user data from the OAuth provider.
 * @param provider - The OAuth provider (e.g., 'google', 'github').
 * @param inviteTokenId - The ID of the invitation token.
 * @param oauthAccount - The linked OAuth account, if one exists.
 * @returns A redirect response.
 */
export const inviteFlow = async (
  ctx: Context,
  providerUser: TransformedUser,
  provider: EnabledOAuthProvider,
  inviteTokenId: TokenModel['id'],
  oauthAccount: OAuthAccountModel | null = null,
): Promise<Response> => {
  // Token not found → invalid invitation
  const invitationToken = await getInvitationToken(inviteTokenId);

  if (!invitationToken) {
    throw new AppError({ status: 403, type: 'oauth_token_missing', severity: 'warn', isRedirect: true });
  }

  // Email in token doesn't match provider email
  if (invitationToken.email !== providerUser.email) {
    throw new AppError({ status: 409, type: 'oauth_wrong_email', severity: 'warn', isRedirect: true });
  }

  // OAuth account already linked
  if (oauthAccount) throw new AppError({ status: 409, type: 'oauth_mismatch', severity: 'warn', isRedirect: true });

  // No linked OAuth account and email already in use by an existing user
  const users = await getUsersByConditions([eq(emailsTable.email, providerUser.email)]);
  if (users.length) throw new AppError({ status: 409, type: 'oauth_mismatch', severity: 'warn', isRedirect: true });

  // User already signed up meanwhile

  // No user match → create a new user
  const user = await handleCreateUser({
    newUser: providerUser,
    membershipInviteTokenId: invitationToken.entityType ? invitationToken.id : null,
    emailVerified: false,
  });

  // link user to new OAuth account and prompt email verification
  const newOAuthAccount = await createOAuthAccount(user.id, providerUser.id, provider, providerUser.email);
  return await handleUnverifiedOAuthAccount(ctx, newOAuthAccount, 'invite');
};

/**
 * Retrieves an OAuth account based on provider user ID, provider ID, and email.
 *
 * @param providerUserId - Unique user ID provided by the OAuth provider.
 * @param providerId - Identifier for the OAuth provider (e.g., "google", "github").
 * @param providerUserEmail - Email address associated with the OAuth account.
 * @returns The matched OAuth account or null if not found.
 */
export const getOAuthAccount = async (
  providerUserId: Provider['userId'],
  providerId: Provider['id'],
  providerUserEmail: UserModel['email'],
): Promise<OAuthAccountModel | null> => {
  const [oauthAccount] = await db
    .select()
    .from(oauthAccountsTable)
    .where(
      and(
        eq(oauthAccountsTable.providerUserId, providerUserId),
        eq(oauthAccountsTable.providerId, providerId),
        eq(oauthAccountsTable.email, providerUserEmail),
      ),
    );

  return oauthAccount ?? null;
};

/**
 * Inserts a new OAuth account into the database.
 *
 * @param userId - Internal user ID to associate with the OAuth account.
 * @param providerUserId - Unique user ID from the OAuth provider.
 * @param providerId - Identifier for the OAuth provider.
 * @param email - Email address associated with the OAuth account.
 * @returns The created OAuth account.
 */
const createOAuthAccount = async (
  userId: OAuthAccountModel['userId'],
  providerUserId: Provider['userId'],
  providerId: Provider['id'],
  email: UserModel['email'],
): Promise<OAuthAccountModel> => {
  const [oauthAccount] = await db
    .insert(oauthAccountsTable)
    .values({
      userId,
      providerUserId,
      providerId,
      email,
      verified: false,
    })
    .returning();

  return oauthAccount;
};

/**
 * Fetches an invitation token by its ID.
 *
 * @param inviteTokenId - The token ID to search for.
 * @returns The token if found, or null otherwise.
 */
const getInvitationToken = async (inviteTokenId: TokenModel['id']): Promise<TokenModel | null> => {
  const [token] = await db.select().from(tokensTable).where(eq(tokensTable.id, inviteTokenId));

  return token ?? null;
};

/**
 * Retrieves a user using their OAuth account's internal user ID.
 *
 * @param oauthAccount - The OAuth account to look up the user for.
 * @returns The matched user.
 */
const getUserByOAuthAccount = async (oauthAccount: OAuthAccountModel): Promise<UserModel> => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, oauthAccount.userId));

  return user;
};

/**
 * Sets up the user session and redirects to the specified URL
 * for verified OAuth accounts.
 *
 * @param ctx - The request context.
 * @param user - The authenticated user.
 * @param oauthAccount - The verified OAuth account.
 * @returns A redirect response.
 */
const handleVerifiedOAuthAccount = async (ctx: Context, user: UserModel, oauthAccount: OAuthAccountModel): Promise<Response> => {
  const redirectPath = await getOAuthRedirectPath(ctx);

  await setUserSession(ctx, user, oauthAccount.providerId);
  const redirectUrl = new URL(redirectPath, appConfig.frontendUrl);
  return ctx.redirect(redirectUrl, 302);
};

/**
 * Sends a verification email and redirects to  page to explain the next step.
 *
 * @param ctx - The request context.
 * @param oauthAccount - The unverified OAuth account.
 * @returns A redirect response.
 */
const handleUnverifiedOAuthAccount = async (
  ctx: Context,
  oauthAccount: OAuthAccountModel,
  reason: 'signup' | 'signin' | 'connect' | 'invite',
): Promise<Response> => {
  const redirectPath = await getOAuthRedirectPath(ctx);

  sendVerificationEmail({ userId: oauthAccount.userId, oauthAccountId: oauthAccount.id, redirectPath });

  const redirectUrl = new URL(`/auth/email-verification/${reason}`, appConfig.frontendUrl);

  return ctx.redirect(redirectUrl, 302);
};
