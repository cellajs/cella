import { appConfig, type EnabledOAuthProvider } from 'config';
import { and, eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { db } from '#/db/db';
import { emailsTable } from '#/db/schema/emails';
import { type OAuthAccountModel, oauthAccountsTable } from '#/db/schema/oauth-accounts';
import { type UserModel, usersTable } from '#/db/schema/users';
import { Env } from '#/lib/context';
import { AppError, ConstructedError } from '#/lib/errors';
import { initiateMfa } from '#/modules/auth/general/helpers/mfa';
import { getParsedSessionCookie, setUserSession, validateSession } from '#/modules/auth/general/helpers/session';
import { handleCreateUser } from '#/modules/auth/general/helpers/user';
import { OAuthCookiePayload } from '#/modules/auth/oauth/helpers/initiation';
import type { Provider } from '#/modules/auth/oauth/helpers/providers';
import { sendOAuthVerificationEmail } from '#/modules/auth/oauth/helpers/send-oauth-verification-email';
import type { TransformedUser } from '#/modules/auth/oauth/helpers/transform-user-data';
import { userSelect } from '#/modules/users/helpers/select';
import { getValidSingleUseToken } from '#/utils/get-valid-single-use-token';
import { isValidRedirectPath } from '#/utils/is-redirect-url';
import { getIsoDate } from '#/utils/iso-date';

type OAuthFlowResult =
  | {
      type: 'verified';
      user: UserModel;
      oauthAccount: OAuthAccountModel;
    }
  | {
      type: 'unverified';
      oauthAccount: OAuthAccountModel;
      reason: 'signup' | 'signin' | 'connect' | 'invite';
    };

interface BaseCallbackProps {
  providerUser: TransformedUser;
  provider: EnabledOAuthProvider;
  oauthAccount?: OAuthAccountModel | null;
}

/**
 * Handles the OAuth provider callback for authentication, account linking, or invitation flows.
 *
 * This function determines the appropriate flow based on `type` from OAuth payload:
 * - 'connect' → link an existing account with the OAuth provider
 * - 'invite'  → handle invited users completing OAuth signup
 * - 'verify'  → verify an existing OAuth account
 * - 'auth'    → standard authentication/signup flow
 *
 * It fetches any existing OAuth account, executes corresponding flow handler,
 * and then processes OAuth account to handle session setup, MFA, or verification email,
 * ultimately redirecting user to correct client page.
 *
 * @param ctx - Request context containing request and environment info.
 * @param oauthPayload - Payload from OAuth flow, including type and optional redirect.
 * @param providerUser - Transformed user data returned by OAuth provider.
 * @param provider - OAuth provider identifier (e.g., 'google', 'github').
 * @returns A redirect response to appropriate client page.
 */
export const handleOAuthCallback = async (
  ctx: Context<Env>,
  oauthPayload: OAuthCookiePayload,
  providerUser: TransformedUser,
  provider: EnabledOAuthProvider,
): Promise<Response> => {
  const { type, redirectAfter } = oauthPayload;

  // Fetch any existing OAuth account for this provider/user
  const [oauthAccount] = await db
    .select()
    .from(oauthAccountsTable)
    .where(
      and(
        eq(oauthAccountsTable.providerUserId, providerUser.id),
        eq(oauthAccountsTable.provider, provider),
        eq(oauthAccountsTable.email, providerUser.email),
      ),
    );

  const baseCallbackProps = { providerUser, provider, oauthAccount };

  let result: OAuthFlowResult;

  try {
    switch (type) {
      case 'connect':
        result = await connectCallbackFlow({ ctx, ...baseCallbackProps });
        break;
      case 'invite':
        result = await inviteCallbackFlow({ ctx, ...baseCallbackProps });
        break;
      case 'verify':
        result = await verifyCallbackFlow({ ctx, ...baseCallbackProps });

        break;
      case 'auth':
        result = await authCallbackFlow(baseCallbackProps);

        break;
    }
  } catch (err) {
    if (err instanceof AppError) {
      const errorPagePath = type === 'connect' ? '/account' : '/auth/error';
      throw new AppError({
        ...err,
        type: err.type as ConstructedError['type'],
        shouldRedirect: true,
        meta: { ...err.meta, errorPagePath },
      });
    }
    throw err;
  }

  return await processOAuthAccount({ ctx, redirectAfter, ...result });
};

/**
 * Handles the basic OAuth authentication/signup flow.
 * Determines if the user has an existing verified/unverified account or needs to register.
 */
const authCallbackFlow = async ({
  providerUser,
  provider,
  oauthAccount = null,
}: BaseCallbackProps): Promise<OAuthFlowResult> => {
  // User already has a verified OAuth account → sign in
  if (oauthAccount?.verified) {
    const [user] = await db.select(userSelect).from(usersTable).where(eq(usersTable.id, oauthAccount.userId));
    return { type: 'verified', user, oauthAccount };
  }

  // User has an unverified OAuth account → prompt oauth (re-)verification
  if (oauthAccount) {
    const [user] = await db.select(userSelect).from(usersTable).where(eq(usersTable.id, oauthAccount.userId));
    const type = user.lastSignInAt ? 'connect' : 'signup';
    return { type: 'unverified', oauthAccount, reason: type };
  }

  // Get users with the same email
  const users = await db
    .select({ userId: usersTable.id })
    .from(emailsTable)
    .innerJoin(usersTable, eq(usersTable.id, emailsTable.userId))
    .where(eq(emailsTable.email, providerUser.email))
    .limit(2);

  // Multiple users with the same email → conflict
  if (users.length > 1) throw new AppError({ status: 409, type: 'oauth_conflict', severity: 'error' });

  // Existing user (by email) found -> suggest sign in and connect
  if (users.length === 1) throw new AppError({ status: 409, type: 'oauth_email_exists', severity: 'warn' });

  // No user found and registration is disabled
  if (!appConfig.has.registrationEnabled) {
    throw new AppError({ status: 403, type: 'sign_up_restricted' });
  }

  // No user match → create a new user and OAuth account
  const user = await handleCreateUser({ newUser: providerUser, emailVerified: false });
  const newOAuthAccount = await createOAuthAccount(user.id, providerUser.id, provider, providerUser.email);

  return { type: 'unverified', oauthAccount: newOAuthAccount, reason: 'signup' };
};

/**
 * Handles connecting an OAuth provider to an existing user account.
 *
 * @param ctx - The request context.
 * @param providerUser - The transformed user data from the OAuth provider.
 * @param provider - The OAuth provider (e.g., 'google', 'github').
 * @param connectUserId - The ID of the user who is attempting to connect an OAuth account.
 * @param oauthAccount - The existing OAuth account, if one exists.
 * @param redirectAfter - OAuth query redirect path, if one exists.
 * @returns A redirect response.
 */
const connectCallbackFlow = async ({
  ctx,
  providerUser,
  provider,
  oauthAccount = null,
}: { ctx: Context<Env> } & BaseCallbackProps): Promise<OAuthFlowResult> => {
  const { sessionToken } = await getParsedSessionCookie(ctx);

  // Get user from valid session
  const { user } = await validateSession(sessionToken);
  if (!user) throw new AppError({ status: 404, type: 'not_found', entityType: 'user', severity: 'error' });

  const connectUserId = user.id;

  if (oauthAccount) {
    // OAuth account is linked to a different user
    if (oauthAccount.userId !== connectUserId) {
      throw new AppError({ status: 409, type: 'oauth_conflict', severity: 'error' });
    }

    // Already linked + verified → return verified result
    if (oauthAccount.verified) return { type: 'verified', user, oauthAccount };

    // Linked but unverified → return unverified result
    return { type: 'unverified', oauthAccount, reason: 'connect' };
  }

  // New OAuth account connection → validate email isn't used by another user
  const users = await db
    .select(userSelect)
    .from(usersTable)
    .leftJoin(emailsTable, eq(usersTable.id, emailsTable.userId))
    .where(eq(emailsTable.email, providerUser.email));
  if (users.some((u) => u.id !== connectUserId)) {
    throw new AppError({ status: 409, type: 'oauth_conflict', severity: 'error' });
  }

  // Safe to connect → create and link OAuth account to current user
  const newOAuthAccount = await createOAuthAccount(connectUserId, providerUser.id, provider, providerUser.email);
  return { type: 'unverified', oauthAccount: newOAuthAccount, reason: 'connect' };
};

/**
 * Handles user sign-up via invitation flow.
 * Validates the invitation token, checks email matches, and creates an OAuth account.
 *
 * @param ctx - The request context.
 * @param providerUser - The transformed user data from the OAuth provider.
 * @param provider - The OAuth provider (e.g., 'google', 'github').
 * @param oauthAccount - The linked OAuth account, if one exists.
 * @param redirectAfter - OAuth query redirect path, if one exists.
 * @returns A redirect response.
 */
const inviteCallbackFlow = async ({
  ctx,
  providerUser,
  provider,
  oauthAccount = null,
}: { ctx: Context<Env> } & BaseCallbackProps): Promise<OAuthFlowResult> => {
  const invitationToken = await getValidSingleUseToken({ ctx, tokenType: 'invitation' });

  // Email in token doesn't match provider email
  if (invitationToken.email !== providerUser.email) {
    throw new AppError({ status: 409, type: 'oauth_wrong_email', severity: 'error' });
  }

  // OAuth account already linked
  if (oauthAccount) throw new AppError({ status: 409, type: 'oauth_conflict', severity: 'error' });

  // No linked OAuth account and email already in use by an existing user
  const users = await db
    .select(userSelect)
    .from(usersTable)
    .leftJoin(emailsTable, eq(usersTable.id, emailsTable.userId))
    .where(eq(emailsTable.email, providerUser.email));
  if (users.length) throw new AppError({ status: 409, type: 'oauth_email_exists', severity: 'error' });

  // TODO User already signed up meanwhile?

  // No user match → create a new user
  const user = await handleCreateUser({ newUser: providerUser, emailVerified: false });

  // link user to new OAuth account and prompt email verification
  const newOAuthAccount = await createOAuthAccount(user.id, providerUser.id, provider, providerUser.email);
  return { type: 'unverified', oauthAccount: newOAuthAccount, reason: 'invite' };
};

const verifyCallbackFlow = async ({
  ctx,
  providerUser,
  provider,
  oauthAccount = null,
}: { ctx: Context<Env> } & BaseCallbackProps): Promise<OAuthFlowResult> => {
  const verifyToken = await getValidSingleUseToken({ ctx, tokenType: 'oauth-verification' });

  // No OauthAccount → invalid verification
  if (!oauthAccount) throw new AppError({ status: 400, type: 'oauth_failed', severity: 'error' });

  // Invalid token settings → invalid verification
  if (
    verifyToken.type !== 'oauth-verification' ||
    verifyToken.email !== providerUser.email ||
    verifyToken.oauthAccountId !== oauthAccount.id ||
    oauthAccount.provider !== provider
  ) {
    throw new AppError({ status: 400, type: 'oauth_failed', severity: 'error' });
  }

  const [user] = await db.select(userSelect).from(usersTable).where(eq(usersTable.id, oauthAccount.userId));

  // Somehow already linked + verified → return verified result
  if (oauthAccount.verified) return { type: 'verified', user, oauthAccount };

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
  await db
    .insert(emailsTable)
    .values({ email: verifyToken.email, userId: user.id, verified: true, verifiedAt: getIsoDate() })
    .onConflictDoNothing();

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

  // Verification successful → return verified OAuth account result
  return { type: 'verified', user, oauthAccount };
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
 * Processes an OAuth account after provider callback.
 *
 * This function handles both verified and unverified OAuth accounts:
 * - Verified, it may initiate MFA and/or set user session, then redirects to appropriate post-login path.
 * - Unverified, it sends a verification email and redirects  user to an email verification page with context.
 *
 * @param info - Contains OAuth flow result, request context, optional redirect path
 * @returns A redirect response to appropriate client page.
 */
const processOAuthAccount = async (info: OAuthFlowResult & { ctx: Context<Env>; redirectAfter?: string }) => {
  const { ctx, type, oauthAccount, redirectAfter } = info;
  const redirectAfterPath = isValidRedirectPath(redirectAfter) || appConfig.defaultRedirectPath;

  if (type === 'verified') {
    // Start MFA challenge if the user has MFA enabled
    const mfaRedirectPath = await initiateMfa(ctx, info.user);

    // Build full URL for redirect
    const redirectPath = mfaRedirectPath || redirectAfterPath;
    const redirectUrl = new URL(redirectPath, appConfig.frontendUrl);

    // If MFA is not required, set session immediately
    if (!mfaRedirectPath) await setUserSession(ctx, info.user, oauthAccount.provider);

    // Redirect to determined URL
    return ctx.redirect(redirectUrl, 302);
  } else {
    // For unverified accounts, send an OAuth verification email
    sendOAuthVerificationEmail({
      userId: oauthAccount.userId,
      oauthAccountId: oauthAccount.id,
      redirectPath: redirectAfterPath,
    });

    // Redirect to client explaining next step for email verification
    const redirectUrl = new URL(
      `/auth/email-verification/${info.reason}?provider=${oauthAccount.provider}`,
      appConfig.frontendUrl,
    );

    return ctx.redirect(redirectUrl, 302);
  }
};
