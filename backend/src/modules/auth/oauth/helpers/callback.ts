import { and, eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { appConfig, type EnabledOAuthProvider } from 'shared';
import type { Env } from '#/core/context';
import { AppError, type ErrorKey } from '#/core/error';
import { type DbOrTx, baseDb as db } from '#/db/db';
import { finishSignIn } from '#/modules/auth/general/helpers/finish-sign-in';
import { handleCreateUser } from '#/modules/auth/general/helpers/user';
import type { Provider } from '#/modules/auth/oauth/helpers/providers';
import { sendOAuthVerificationEmail } from '#/modules/auth/oauth/helpers/send-oauth-verification-email';
import type { TransformedUser } from '#/modules/auth/oauth/helpers/transform-user-data';
import { type OAuthAccountModel, oauthAccountsTable } from '#/modules/auth/oauth/oauth-accounts-db';
import type { OAuthCookiePayload } from '#/modules/auth/oauth/oauth-schema';
import { emailsTable } from '#/modules/user/emails-db';
import type { UserWithCounters } from '#/modules/user/helpers/select';
import { userSelect } from '#/modules/user/helpers/select';
import type { UserModel } from '#/modules/user/user-db';
import { usersTable } from '#/modules/user/user-db';
import { getValidSingleUseToken } from '#/utils/get-valid-single-use-token';
import { isValidRedirectPath } from '#/utils/is-redirect-url';
import { getIsoDate } from '#/utils/iso-date';

type OAuthFlowResult =
  | {
      type: 'verified';
      user: UserWithCounters;
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

/** Routes connect, invite, verify and authentication callbacks; `processOAuthAccount` then does session setup, MFA, verification and redirect. */
export const handleOAuthCallback = async (
  ctx: Context<Env>,
  oauthPayload: OAuthCookiePayload,
  providerUser: TransformedUser,
  provider: EnabledOAuthProvider,
): Promise<Response> => {
  const { type, redirectAfter } = oauthPayload;

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
        result = await connectCallbackFlow({ connectUserId: oauthPayload.connectUserId, ...baseCallbackProps });
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
      throw new AppError(err.status, err.type as ErrorKey, err.severity, {
        willRedirect: appConfig.mode !== 'test',
        meta: { ...err.meta, errorPagePath },
      });
    }
    throw err;
  }

  return await processOAuthAccount({ ctx, redirectAfter, ...result });
};

/** Basic OAuth authentication and signup: existing verified account, unverified account, or new registration. */
const authCallbackFlow = async ({
  providerUser,
  provider,
  oauthAccount = null,
}: BaseCallbackProps): Promise<OAuthFlowResult> => {
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

  const users = await db
    .select({ userId: usersTable.id })
    .from(emailsTable)
    .innerJoin(usersTable, eq(usersTable.id, emailsTable.userId))
    .where(eq(emailsTable.email, providerUser.email))
    .limit(2);

  if (users.length > 1) throw new AppError(409, 'oauth_conflict', 'error');

  // Existing user (by email) found -> suggest sign in and connect
  if (users.length === 1) throw new AppError(409, 'oauth_email_exists', 'warn');

  if (!appConfig.has.selfRegistration) {
    throw new AppError(403, 'sign_up_restricted', 'info');
  }

  // No user match → create a new user and OAuth account atomically
  const newOAuthAccount = await db.transaction(async (tx) => {
    const user = await handleCreateUser({ var: { db: tx } }, { newUser: providerUser, emailVerified: false });
    return createOAuthAccount(tx, user.id, providerUser.id, provider, providerUser.email);
  });

  return { type: 'unverified', oauthAccount: newOAuthAccount, reason: 'signup' };
};

/**
 * Connects an OAuth provider to an existing user account. The connecting user comes from the signed oauth-state payload, pinned at
 * initiation where the session was validated, because the SameSite=Strict session cookie is absent on the provider's cross-site callback.
 */
const connectCallbackFlow = async ({
  connectUserId,
  providerUser,
  provider,
  oauthAccount = null,
}: { connectUserId?: string } & BaseCallbackProps): Promise<OAuthFlowResult> => {
  if (!connectUserId) throw new AppError(401, 'unauthorized', 'warn');

  const [user] = await db.select(userSelect).from(usersTable).where(eq(usersTable.id, connectUserId));
  if (!user) throw new AppError(404, 'not_found', 'error', { entityType: 'user' });

  if (oauthAccount) {
    if (oauthAccount.userId !== connectUserId) {
      throw new AppError(409, 'oauth_conflict', 'error');
    }

    if (oauthAccount.verified) return { type: 'verified', user, oauthAccount };

    return { type: 'unverified', oauthAccount, reason: 'connect' };
  }

  // New OAuth account connection → validate email isn't used by another user
  const users = await db
    .select(userSelect)
    .from(usersTable)
    .leftJoin(emailsTable, eq(usersTable.id, emailsTable.userId))
    .where(eq(emailsTable.email, providerUser.email));
  if (users.some((u) => u.id !== connectUserId)) {
    throw new AppError(409, 'oauth_conflict', 'error');
  }

  const newOAuthAccount = await createOAuthAccount(db, connectUserId, providerUser.id, provider, providerUser.email);
  return { type: 'unverified', oauthAccount: newOAuthAccount, reason: 'connect' };
};

/** Sign-up via invitation: validates the token and requires its email to match the provider email before creating the OAuth account. */
const inviteCallbackFlow = async ({
  ctx,
  providerUser,
  provider,
  oauthAccount = null,
}: { ctx: Context<Env> } & BaseCallbackProps): Promise<OAuthFlowResult> => {
  const invitationToken = await getValidSingleUseToken({ ctx, tokenType: 'invitation' });

  if (invitationToken.email !== providerUser.email) {
    throw new AppError(409, 'oauth_wrong_email', 'error');
  }

  if (oauthAccount) throw new AppError(409, 'oauth_conflict', 'error');

  // Email already in use by an existing user (checks both the emails and users tables)
  const usersWithVerifiedEmail = await db
    .select(userSelect)
    .from(usersTable)
    .leftJoin(emailsTable, eq(usersTable.id, emailsTable.userId))
    .where(eq(emailsTable.email, providerUser.email));
  if (usersWithVerifiedEmail.length) throw new AppError(409, 'oauth_email_exists', 'error');

  // User may have signed up via another method (e.g. OAuth) but hasn't verified email yet
  const [existingUser] = await db.select(userSelect).from(usersTable).where(eq(usersTable.email, providerUser.email));
  if (existingUser) throw new AppError(409, 'oauth_email_exists', 'error');

  // No user match → create a new user and OAuth account atomically
  const newOAuthAccount = await db.transaction(async (tx) => {
    const user = await handleCreateUser({ var: { db: tx } }, { newUser: providerUser, emailVerified: false });
    return createOAuthAccount(tx, user.id, providerUser.id, provider, providerUser.email);
  });

  return { type: 'unverified', oauthAccount: newOAuthAccount, reason: 'invite' };
};

const verifyCallbackFlow = async ({
  ctx,
  providerUser,
  provider,
  oauthAccount = null,
}: { ctx: Context<Env> } & BaseCallbackProps): Promise<OAuthFlowResult> => {
  const verifyToken = await getValidSingleUseToken({ ctx, tokenType: 'oauth-verification' });

  if (!oauthAccount) throw new AppError(400, 'oauth_failed', 'error');

  if (
    verifyToken.type !== 'oauth-verification' ||
    verifyToken.email !== providerUser.email ||
    verifyToken.oauthAccountId !== oauthAccount.id ||
    oauthAccount.provider !== provider
  ) {
    throw new AppError(400, 'oauth_failed', 'error');
  }

  const [user] = await db.select(userSelect).from(usersTable).where(eq(usersTable.id, oauthAccount.userId));

  if (oauthAccount.verified) return { type: 'verified', user, oauthAccount };

  // Verify oauthAccount + email rows atomically
  await db.transaction(async (tx) => {
    await tx
      .update(oauthAccountsTable)
      .set({ verified: true, verifiedAt: getIsoDate() })
      .where(
        and(
          eq(oauthAccountsTable.id, oauthAccount.id),
          eq(oauthAccountsTable.userId, user.id),
          eq(oauthAccountsTable.email, verifyToken.email),
        ),
      );

    await tx
      .update(emailsTable)
      .set({ verified: true, verifiedAt: getIsoDate() })
      .where(and(eq(emailsTable.email, verifyToken.email), eq(emailsTable.userId, user.id)));
  });

  return { type: 'verified', user, oauthAccount };
};

const createOAuthAccount = async (
  dbOrTx: DbOrTx,
  userId: OAuthAccountModel['userId'],
  providerUserId: Provider['userId'],
  provider: Provider['id'],
  email: UserModel['email'],
): Promise<OAuthAccountModel> => {
  const [oauthAccount] = await dbOrTx
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
 * Post-callback handling: verified accounts may start an MFA challenge and/or set the session, then redirect to the post-login path.
 * Unverified accounts get a verification email and land on the email-verification page.
 */
const processOAuthAccount = async (info: OAuthFlowResult & { ctx: Context<Env>; redirectAfter?: string }) => {
  const { ctx, type, oauthAccount, redirectAfter } = info;
  // Stored on the verification token; null means "use the default path" at the final hop.
  const redirectAfterPath = isValidRedirectPath(redirectAfter) || null;

  if (type === 'verified') {
    return finishSignIn(ctx, info.user, oauthAccount.provider, redirectAfter);
  }
  // Awaited so the verification token is persisted before the redirect to the "check your email" page.
  await sendOAuthVerificationEmail({
    userId: oauthAccount.userId,
    oauthAccountId: oauthAccount.id,
    redirectPath: redirectAfterPath,
  });

  const redirectUrl = new URL(
    `/auth/email-verification/${info.reason}?provider=${oauthAccount.provider}`,
    appConfig.frontendUrl,
  );

  return ctx.redirect(redirectUrl, 302);
};
