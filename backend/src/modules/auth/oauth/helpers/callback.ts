import { appConfig, type EnabledOAuthProvider } from 'config';
import { and, eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { db } from '#/db/db';
import { emailsTable } from '#/db/schema/emails';
import { type OAuthAccountModel, oauthAccountsTable } from '#/db/schema/oauth-accounts';
import { type UserModel, usersTable } from '#/db/schema/users';
import { Env } from '#/lib/context';
import { AppError } from '#/lib/errors';
import { getAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { initiateMfa } from '#/modules/auth/general/helpers/mfa';
import { getParsedSessionCookie, setUserSession, validateSession } from '#/modules/auth/general/helpers/session';
import { handleCreateUser } from '#/modules/auth/general/helpers/user';
import type { Provider } from '#/modules/auth/oauth/helpers/providers';
import { sendOAuthVerificationEmail } from '#/modules/auth/oauth/helpers/send-oauth-verification-email';
import type { TransformedUser } from '#/modules/auth/oauth/helpers/transform-user-data';
import { OAuthFlowType } from '#/modules/auth/oauth/schema';
import { usersBaseQuery } from '#/modules/users/helpers/select';
import { getValidSingleUseToken } from '#/utils/get-valid-single-use-token';
import { isValidRedirectPath } from '#/utils/is-redirect-url';
import { getIsoDate } from '#/utils/iso-date';

/**
 * Handles the default OAuth authentication/signup flow.
 * Determines if the user has an existing verified/unverified account or needs to register.
 *
 * @param ctx - The request context.
 * @param callbackType - type of callback, ie 'invite', 'connect'.
 * @param providerUser - The transformed user data from the OAuth provider.
 * @param provider - The OAuth provider (e.g., 'google', 'github').
 *
 * @returns A redirect response.
 */
export const handleOAuthCallback = async (
  ctx: Context<Env>,
  callbackType: OAuthFlowType,
  providerUser: TransformedUser,
  provider: EnabledOAuthProvider,
): Promise<Response> => {
  const redirectPath = '/auth/authenticate';
  const oauthAccount = await getOAuthAccount(providerUser.id, provider, providerUser.email);

  // Handle OAuth callback flows based on cookie
  if (callbackType === 'connect') return await connectCallbackFlow(ctx, providerUser, provider, oauthAccount);
  if (callbackType === 'invite') return await inviteCallbackFlow(ctx, providerUser, provider, oauthAccount);
  if (callbackType === 'verify') return await verifyCallbackFlow(ctx, providerUser, provider, oauthAccount);

  // If not any of the above, proceed with basic authentication (sign in / sign up) flow

  // User already has a verified OAuth account → sign in
  if (oauthAccount?.verified) {
    const [user] = await usersBaseQuery().where(eq(usersTable.id, oauthAccount.userId));
    return await handleVerifiedOAuthAccount(ctx, user, oauthAccount);
  }

  // User has an unverified OAuth account → prompt oauth (re-)verification
  if (oauthAccount) {
    const [user] = await usersBaseQuery().where(eq(usersTable.id, oauthAccount.userId));
    const type = user.lastSignInAt ? 'connect' : 'signup';
    return await handleUnverifiedOAuthAccount(ctx, oauthAccount, type);
  }

  // Get users with the same email
  const users = await db
    .select({ userId: usersTable.id })
    .from(emailsTable)
    .innerJoin(usersTable, eq(usersTable.id, emailsTable.userId))
    .where(eq(emailsTable.email, providerUser.email))
    .limit(2);

  // Multiple users with the same email → conflict
  if (users.length > 1) throw new AppError({ status: 409, type: 'oauth_conflict', severity: 'error', redirectPath });

  // Existing user (by email) found -> suggest sign in and connect
  if (users.length === 1) throw new AppError({ status: 409, type: 'oauth_email_exists', severity: 'warn', redirectPath });

  // No user found and registration is disabled
  if (!appConfig.has.registrationEnabled) {
    throw new AppError({ status: 403, type: 'sign_up_restricted', redirectPath });
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
const connectCallbackFlow = async (
  ctx: Context<Env>,
  providerUser: TransformedUser,
  provider: EnabledOAuthProvider,
  oauthAccount: OAuthAccountModel | null = null,
): Promise<Response> => {
  const redirectPath = `/settings#authentication`;

  const { sessionToken } = await getParsedSessionCookie(ctx, { redirectOnError: redirectPath });

  // Get user from valid session
  const { user } = await validateSession(sessionToken);
  if (!user) throw new AppError({ status: 404, type: 'not_found', entityType: 'user', severity: 'error', redirectPath });

  const connectUserId = user.id;

  if (oauthAccount) {
    // OAuth account is linked to a different user
    if (oauthAccount.userId !== connectUserId) {
      throw new AppError({ status: 409, type: 'oauth_conflict', severity: 'error', redirectPath });
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
  const users = await usersBaseQuery().leftJoin(emailsTable, eq(usersTable.id, emailsTable.userId)).where(eq(emailsTable.email, providerUser.email));
  if (users.some((u) => u.id !== connectUserId)) {
    throw new AppError({ status: 409, type: 'oauth_conflict', severity: 'error', redirectPath });
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
 * @param oauthAccount - The linked OAuth account, if one exists.
 * @returns A redirect response.
 */
const inviteCallbackFlow = async (
  ctx: Context<Env>,
  providerUser: TransformedUser,
  provider: EnabledOAuthProvider,
  oauthAccount: OAuthAccountModel | null = null,
): Promise<Response> => {
  const redirectPath = '/auth/authenticate';
  const invitationToken = await getValidSingleUseToken({ ctx, tokenType: 'invitation', redirectPath });

  // Email in token doesn't match provider email
  if (invitationToken.email !== providerUser.email) {
    throw new AppError({ status: 409, type: 'oauth_wrong_email', severity: 'error', redirectPath });
  }

  // OAuth account already linked
  if (oauthAccount) throw new AppError({ status: 409, type: 'oauth_conflict', severity: 'error', redirectPath });

  // No linked OAuth account and email already in use by an existing user
  const users = await usersBaseQuery().leftJoin(emailsTable, eq(usersTable.id, emailsTable.userId)).where(eq(emailsTable.email, providerUser.email));
  if (users.length) throw new AppError({ status: 409, type: 'oauth_email_exists', severity: 'error', redirectPath });

  // TODO User already signed up meanwhile?

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

const verifyCallbackFlow = async (
  ctx: Context<Env>,
  providerUser: TransformedUser,
  provider: EnabledOAuthProvider,
  oauthAccount: OAuthAccountModel | null = null,
): Promise<Response> => {
  const redirectPath = '/auth/authenticate';
  const verifyToken = await getValidSingleUseToken({ ctx, tokenType: 'oauth-verification' });

  // No OauthAccount → invalid verification
  if (!oauthAccount) throw new AppError({ status: 400, type: 'oauth_failed', severity: 'error', redirectPath });

  // Invalid token settings → invalid verification
  if (
    verifyToken.type !== 'oauth-verification' ||
    verifyToken.email !== providerUser.email ||
    verifyToken.oauthAccountId !== oauthAccount.id ||
    oauthAccount.provider !== provider
  ) {
    throw new AppError({ status: 400, type: 'oauth_failed', severity: 'error', redirectPath });
  }

  const [user] = await usersBaseQuery().where(eq(usersTable.id, oauthAccount.userId));

  // Somehow already linked + verified → log in the user
  if (oauthAccount.verified) {
    return await handleVerifiedOAuthAccount(ctx, user, oauthAccount);
  }

  // Verify oauthAccount
  await db
    .update(oauthAccountsTable)
    .set({ verified: true, verifiedAt: getIsoDate() })
    .where(
      and(
        eq(oauthAccountsTable.id, verifyToken.oauthAccountId),
        eq(oauthAccountsTable.userId, user.id),
        eq(oauthAccountsTable.email, verifyToken.email),
      ),
    );

  // Add email to emails table if it doesn't exist
  await db.insert(emailsTable).values({ email: verifyToken.email, userId: user.id, verified: true, verifiedAt: getIsoDate() }).onConflictDoNothing();

  // Set email verified if it exists
  await db
    .update(emailsTable)
    .set({ verified: true, verifiedAt: getIsoDate() })
    .where(
      and(
        eq(emailsTable.tokenId, verifyToken.id),
        eq(emailsTable.userId, user.id),
        eq(emailsTable.email, verifyToken.email),
        eq(emailsTable.verified, false),
      ),
    );

  // Verification successful → redirect to the verified OAuth account handler
  return await handleVerifiedOAuthAccount(ctx, user, oauthAccount);
};

/**
 * Retrieves an OAuth account based on provider user ID, provider ID, and email.
 *
 * @param providerUserId - Unique user ID provided by the OAuth provider.
 * @param provider - Identifier for the OAuth provider (e.g., "google", "github").
 * @param providerUserEmail - Email address associated with the OAuth account.
 * @returns The matched OAuth account or null if not found.
 */
const getOAuthAccount = async (
  providerUserId: Provider['userId'],
  provider: Provider['id'],
  providerUserEmail: UserModel['email'],
): Promise<OAuthAccountModel | null> => {
  const [oauthAccount] = await db
    .select()
    .from(oauthAccountsTable)
    .where(
      and(
        eq(oauthAccountsTable.providerUserId, providerUserId),
        eq(oauthAccountsTable.provider, provider),
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
 * @param provider - Identifier for the OAuth provider.
 * @param email - Email address associated with the OAuth account.
 * @returns The created OAuth account.
 */
const createOAuthAccount = async (
  userId: OAuthAccountModel['userId'],
  providerUserId: Provider['userId'],
  provider: Provider['id'],
  email: UserModel['email'],
): Promise<OAuthAccountModel> => {
  const [oauthAccount] = await db
    .insert(oauthAccountsTable)
    .values({
      userId,
      providerUserId,
      provider,
      email,
      verified: false,
    })
    .returning();

  return oauthAccount;
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
const handleVerifiedOAuthAccount = async (ctx: Context<Env>, user: UserModel, oauthAccount: OAuthAccountModel): Promise<Response> => {
  // Start MFA challenge if the user has MFA enabled
  const mfaRedirectPath = await initiateMfa(ctx, user);

  // Determine final redirect path
  const redirectPath = mfaRedirectPath || (await getOAuthRedirectPath(ctx));
  const redirectUrl = new URL(redirectPath, appConfig.frontendUrl);

  // If MFA is not required, set  user session immediately
  if (!mfaRedirectPath) await setUserSession(ctx, user, oauthAccount.provider);

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
  ctx: Context<Env>,
  oauthAccount: OAuthAccountModel,
  reason: 'signup' | 'signin' | 'connect' | 'invite',
): Promise<Response> => {
  const redirectPath = await getOAuthRedirectPath(ctx);

  sendOAuthVerificationEmail({ userId: oauthAccount.userId, oauthAccountId: oauthAccount.id, redirectPath });

  const redirectUrl = new URL(`/auth/email-verification/${reason}?provider=${oauthAccount.provider}`, appConfig.frontendUrl);

  return ctx.redirect(redirectUrl, 302);
};

/**
 * Retrieves the OAuth redirect path from a cookie, or falls back to a default.
 *
 * @param ctx - The request context.
 * @returns A validated redirect path string.
 */
const getOAuthRedirectPath = async (ctx: Context<Env>): Promise<string> => {
  const redirect = await getAuthCookie(ctx, 'oauth_redirect');

  return isValidRedirectPath(redirect) || appConfig.defaultRedirectPath;
};
