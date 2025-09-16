import { appConfig, type EnabledOAuthProvider } from 'config';
import { and, eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { db } from '#/db/db';
import { emailsTable } from '#/db/schema/emails';
import { type OAuthAccountModel, oauthAccountsTable } from '#/db/schema/oauth-accounts';
import type { TokenModel } from '#/db/schema/tokens';
import { type UserModel, usersTable } from '#/db/schema/users';
import { AppError } from '#/lib/errors';
import { getAuthCookie } from '#/modules/auth/helpers/cookie';
import { initiateMfa } from '#/modules/auth/helpers/mfa';
import type { Provider } from '#/modules/auth/helpers/oauth/providers';
import type { OAuthCookiePayload } from '#/modules/auth/helpers/oauth/session';
import type { TransformedUser } from '#/modules/auth/helpers/oauth/transform-user-data';
import { sendVerificationEmail } from '#/modules/auth/helpers/send-verification-email';
import { setUserSession } from '#/modules/auth/helpers/session';
import { handleCreateUser } from '#/modules/auth/helpers/user';
import { usersBaseQuery } from '#/modules/users/helpers/select';
import { isValidRedirectPath } from '#/utils/is-redirect-url';
import { getIsoDate } from '#/utils/iso-date';
import { getValidToken } from '#/utils/validate-token';

/**
 * Handles the default OAuth authentication/signup flow.
 * Determines if the user has an existing verified/unverified account or needs to register.
 *
 * @param ctx - The request context.
 * @param providerUser - The transformed user data from the OAuth provider.
 * @param provider - The OAuth provider (e.g., 'google', 'github').
 * @param oauthAccount - The linked OAuth account, if one exists.
 *
 * @returns A redirect response.
 */
//TODO improve Error type(to make it more user understandable)
export const handleOAuthFlow = async (
  ctx: Context,
  providerUser: TransformedUser,
  provider: EnabledOAuthProvider,
  cookiePayload: OAuthCookiePayload,
): Promise<Response> => {
  // Restore Context: linked oauthAccount, invitation or account linking
  const oauthAccount = await getOAuthAccount(providerUser.id, provider, providerUser.email);

  const { connectUserId, inviteTokenId, verifyTokenId } = cookiePayload;

  // Handle different OAuth flows based on context
  if (connectUserId) return await connectFlow(ctx, providerUser, provider, connectUserId, oauthAccount);
  if (inviteTokenId) return await inviteFlow(ctx, providerUser, provider, inviteTokenId, oauthAccount);
  if (verifyTokenId) return await verifyFlow(ctx, providerUser, provider, verifyTokenId, oauthAccount);

  return await authFlow(ctx, providerUser, provider, cookiePayload.authFlow, oauthAccount);
};

/**
 * Handles OAuth authentication for sign-in or sign-up.
 *
 * - **Sign-in (`authFlow=signin`)**: uses existing account; triggers verified or unverified flow.
 * - **Sign-up (`authFlow=signup`)**: creates new user if registration is enabled; errors on conflict.
 * - **Fallback**: handles existing account or creates new one; errors on multiple users or if registration is disabled.
 *
 * @param ctx - The request context.
 * @param providerUser - The transformed user data from the OAuth provider.
 * @param provider - The OAuth provider (e.g., 'google', 'github', 'microsoft').
 * @param oauthAccount - The existing OAuth account, if one exists.
 * @returns Response after handling OAuth flow.
 * @throws AppError on conflicts or restricted registration.
 */
const authFlow = async (
  ctx: Context,
  providerUser: TransformedUser,
  provider: EnabledOAuthProvider,
  authFlowType: OAuthCookiePayload['authFlow'],
  oauthAccount: OAuthAccountModel | null = null,
): Promise<Response> => {
  // --- Sign In Flow ---
  if (authFlowType === 'signin') {
    if (!oauthAccount) throw new AppError({ status: 409, type: 'oauth_mismatch', severity: 'warn', isRedirect: true });
    return handleExistingOAuthAccount(ctx, oauthAccount, 'signin');
  }

  // --- Sign Up Flow ---
  if (authFlowType === 'signup') {
    if (!appConfig.has.registrationEnabled) throw new AppError({ status: 403, type: 'sign_up_restricted', isRedirect: true });

    if (oauthAccount) throw new AppError({ status: 409, type: 'oauth_mismatch', severity: 'warn', isRedirect: true });

    const user = await handleCreateUser({ newUser: providerUser, membershipInviteTokenId: null, emailVerified: false });

    const newOAuthAccount = await createOAuthAccount(user.id, providerUser.id, provider, providerUser.email);
    return handleUnverifiedOAuthAccount(ctx, newOAuthAccount, 'signup');
  }

  // --- Handle when authFlow is not specified ---

  if (oauthAccount) return handleExistingOAuthAccount(ctx, oauthAccount, 'signin');

  const users = await usersBaseQuery().leftJoin(emailsTable, eq(usersTable.id, emailsTable.userId)).where(eq(emailsTable.email, providerUser.email));

  if (users.length > 1) throw new AppError({ status: 409, type: 'oauth_mismatch', severity: 'warn', isRedirect: true });

  if (!appConfig.has.registrationEnabled) throw new AppError({ status: 403, type: 'sign_up_restricted', isRedirect: true });

  const newUser = await handleCreateUser({ newUser: providerUser, membershipInviteTokenId: null, emailVerified: false });
  const newAccount = await createOAuthAccount(newUser.id, providerUser.id, provider, providerUser.email);

  return handleUnverifiedOAuthAccount(ctx, newAccount, 'signup');
};

/**
 * Handles connecting an OAuth provider to an existing user account.
 *
 * @param ctx - The request context.
 * @param providerUser - The transformed user data from the OAuth provider.
 * @param provider - The OAuth provider (e.g., 'google', 'github', 'microsoft').
 * @param connectUserId - The ID of the user who is attempting to connect an OAuth account.
 * @param oauthAccount - The existing OAuth account, if one exists.
 * @returns A redirect response.
 */
const connectFlow = async (
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
  const users = await usersBaseQuery().leftJoin(emailsTable, eq(usersTable.id, emailsTable.userId)).where(eq(emailsTable.email, providerUser.email));
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
 * @param provider - The OAuth provider (e.g., 'google', 'github', 'microsoft').
 * @param inviteTokenId - The ID of the invitation token.
 * @param oauthAccount - The linked OAuth account, if one exists.
 * @returns A redirect response.
 */
const inviteFlow = async (
  ctx: Context,
  providerUser: TransformedUser,
  provider: EnabledOAuthProvider,
  inviteTokenId: TokenModel['id'],
  oauthAccount: OAuthAccountModel | null = null,
): Promise<Response> => {
  // Token not found → invalid invitation

  const invitationToken = await getValidToken({
    requiredType: 'invitation',
    tokenId: inviteTokenId,
    missedTokenError: { status: 403, type: 'oauth_token_missing', severity: 'warn', isRedirect: true },
  });

  // Email in token doesn't match provider email
  if (invitationToken.email !== providerUser.email) {
    throw new AppError({ status: 409, type: 'oauth_wrong_email', severity: 'warn', isRedirect: true });
  }

  // OAuth account already linked
  if (oauthAccount) throw new AppError({ status: 409, type: 'oauth_mismatch', severity: 'warn', isRedirect: true });

  // No linked OAuth account and email already in use by an existing user
  const users = await usersBaseQuery().leftJoin(emailsTable, eq(usersTable.id, emailsTable.userId)).where(eq(emailsTable.email, providerUser.email));
  if (users.length) throw new AppError({ status: 409, type: 'oauth_mismatch', severity: 'warn', isRedirect: true });

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

const verifyFlow = async (
  ctx: Context,
  providerUser: TransformedUser,
  provider: EnabledOAuthProvider,
  verifyTokenId: TokenModel['id'],
  oauthAccount: OAuthAccountModel | null = null,
): Promise<Response> => {
  // Token not found → invalid verification
  const verifyToken = await getValidToken({
    requiredType: 'email_verification',
    tokenId: verifyTokenId,
    missedTokenError: { status: 403, type: 'oauth_token_missing', severity: 'warn', isRedirect: true },
  });

  // No OauthAccount → invalid verification
  if (!oauthAccount) throw new AppError({ status: 409, type: 'oauth_mismatch', severity: 'warn', isRedirect: true });

  // Invalid token settings → invalid verification
  if (
    verifyToken.type !== 'email_verification' ||
    verifyToken.email !== providerUser.email ||
    verifyToken.oauthAccountId !== oauthAccount.id ||
    oauthAccount.providerId !== provider
  ) {
    throw new AppError({ status: 409, type: 'oauth_mismatch', severity: 'warn', isRedirect: true });
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
 * @param providerId - Identifier for the OAuth provider (e.g., "google", "github").
 * @param providerUserEmail - Email address associated with the OAuth account.
 * @returns The matched OAuth account or null if not found.
 */
const getOAuthAccount = async (
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
 * Processes an existing OAuth account during sign-in or sign-up.
 *
 * - If account is verified, triggers verified account flow
 * - If account is unverified, triggers unverified account flow
 *
 * @param ctx - The request context.
 * @param account - The OAuth account to handle.
 * @param flow - The authentication flow type: 'signin' or 'signup'.
 * @returns A Response after processing the account.
 */
const handleExistingOAuthAccount = async (ctx: Context, account: OAuthAccountModel, flow: 'signin' | 'signup') => {
  if (account.verified) {
    const [user] = await usersBaseQuery().where(eq(usersTable.id, account.userId));
    return handleVerifiedOAuthAccount(ctx, user, account);
  }
  return handleUnverifiedOAuthAccount(ctx, account, flow);
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
  // Start MFA challenge if the user has MFA enabled
  const mfaRedirectPath = await initiateMfa(ctx, user);

  // Determine final redirect path
  const redirectPath = mfaRedirectPath || (await getOAuthRedirectPath(ctx));
  const redirectUrl = new URL(redirectPath, appConfig.frontendUrl);

  // If MFA is not required, set  user session immediately
  if (!mfaRedirectPath) await setUserSession(ctx, user, oauthAccount.providerId);

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

/**
 * Retrieves the OAuth redirect path from a cookie, or falls back to a default.
 *
 * @param ctx - The request context.
 * @returns A validated redirect path string.
 */
const getOAuthRedirectPath = async (ctx: Context): Promise<string> => {
  const redirect = await getAuthCookie(ctx, 'oauth-redirect');

  return isValidRedirectPath(redirect) || appConfig.defaultRedirectPath;
};
