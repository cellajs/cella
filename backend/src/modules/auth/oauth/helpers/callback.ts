import { and, eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { appConfig, type EnabledOAuthProvider } from 'shared';
import type { Env } from '#/core/context';
import { AppError, type ErrorKey } from '#/core/error';
import { type DbOrTx, baseDb as db } from '#/db/db';
import { finishSignIn } from '#/modules/auth/general/helpers/finish-sign-in';
import { addProvenEmail, requireEmailVerified } from '#/modules/auth/general/helpers/mark-email-verified';
import { handleCreateUser } from '#/modules/auth/general/helpers/user';
import { type IdentityModel, identitiesTable } from '#/modules/auth/identities-db';
import { sendOAuthVerificationEmail } from '#/modules/auth/oauth/helpers/send-oauth-verification-email';
import type { TransformedUser } from '#/modules/auth/oauth/helpers/transform-user-data';
import type { OAuthCookiePayload } from '#/modules/auth/oauth/oauth-schema';
import type { UserWithCounters } from '#/modules/user/helpers/select';
import type { UserModel } from '#/modules/user/user-db';
import { findUserByEmail, findUserById } from '#/modules/user/user-queries';
import { getValidSingleUseToken } from '#/utils/get-valid-single-use-token';
import { isValidRedirectPath } from '#/utils/is-redirect-url';
import { getIsoDate } from '#/utils/iso-date';

type OAuthFlowResult =
  | {
      type: 'verified';
      user: UserWithCounters;
      identity: IdentityModel;
    }
  | {
      type: 'unverified';
      identity: IdentityModel;
      reason: 'signup' | 'signin' | 'connect' | 'invite';
    };

interface BaseCallbackProps {
  providerUser: TransformedUser;
  provider: EnabledOAuthProvider;
  identity?: IdentityModel | null;
}

/** Routes connect, invite, verify and authentication callbacks; `processCallbackResult` then does session setup, MFA, verification and redirect. */
export const handleOAuthCallback = async (
  ctx: Context<Env>,
  oauthPayload: OAuthCookiePayload,
  providerUser: TransformedUser,
  provider: EnabledOAuthProvider,
): Promise<Response> => {
  const { type, redirectAfter } = oauthPayload;

  // The provider's subject is the identity; the asserted address is a snapshot that may have changed since linking.
  const [identity] = await db
    .select()
    .from(identitiesTable)
    .where(
      and(
        eq(identitiesTable.kind, 'oauth'),
        eq(identitiesTable.issuer, provider),
        eq(identitiesTable.subject, providerUser.id),
      ),
    );

  const baseCallbackProps = { providerUser, provider, identity };

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

  return await processCallbackResult({ ctx, redirectAfter, provider, ...result });
};

/** Basic OAuth authentication and signup: existing verified account, unverified account, or new registration. */
const authCallbackFlow = async ({
  providerUser,
  provider,
  identity = null,
}: BaseCallbackProps): Promise<OAuthFlowResult> => {
  if (identity?.verified) {
    const user = await findUserById({ var: { db } }, { id: identity.userId });
    await touchIdentity(identity, providerUser);
    return { type: 'verified', user, identity };
  }

  // User has an unverified OAuth account → prompt oauth (re-)verification, mailed to the address the provider asserts now
  if (identity) {
    await refreshIdentityEmail(identity, providerUser);
    const user = await findUserById({ var: { db } }, { id: identity.userId });
    const type = user.lastSignInAt ? 'connect' : 'signup';
    return { type: 'unverified', identity, reason: type };
  }

  // Existing user (by email) found -> suggest sign in and connect
  const holder = await findUserByEmail({ var: { db } }, { email: providerUser.email });
  if (holder) throw new AppError(409, 'oauth_email_exists', 'warn');

  if (!appConfig.has.selfRegistration) {
    throw new AppError(403, 'sign_up_restricted', 'info');
  }

  // No user match → create a new user and OAuth account atomically
  const newIdentity = await db.transaction(async (tx) => {
    const user = await handleCreateUser({ var: { db: tx } }, { newUser: providerUser, emailVerified: false });
    return createIdentity(tx, {
      userId: user.id,
      issuer: provider,
      subject: providerUser.id,
      email: providerUser.email,
    });
  });

  return { type: 'unverified', identity: newIdentity, reason: 'signup' };
};

/**
 * Connects an OAuth provider to an existing user account. The connecting user comes from the signed oauth-state payload, pinned at
 * initiation where the session was validated, because the SameSite=Strict session cookie is absent on the provider's cross-site callback.
 */
const connectCallbackFlow = async ({
  connectUserId,
  providerUser,
  provider,
  identity = null,
}: { connectUserId?: string } & BaseCallbackProps): Promise<OAuthFlowResult> => {
  if (!connectUserId) throw new AppError(401, 'unauthorized', 'warn');

  const user = await findUserById({ var: { db } }, { id: connectUserId });
  if (!user) throw new AppError(404, 'not_found', 'error', { entityType: 'user' });

  if (identity) {
    if (identity.userId !== connectUserId) {
      throw new AppError(409, 'oauth_conflict', 'error');
    }

    if (identity.verified) {
      await touchIdentity(identity, providerUser);
      return { type: 'verified', user, identity };
    }

    await refreshIdentityEmail(identity, providerUser);
    return { type: 'unverified', identity, reason: 'connect' };
  }

  // New OAuth account connection → validate email isn't used by another user
  const holder = await findUserByEmail({ var: { db } }, { email: providerUser.email });
  if (holder && holder.id !== connectUserId) throw new AppError(409, 'oauth_conflict', 'error');

  const newIdentity = await createIdentity(db, {
    userId: connectUserId,
    issuer: provider,
    subject: providerUser.id,
    email: providerUser.email,
  });
  return { type: 'unverified', identity: newIdentity, reason: 'connect' };
};

/** Sign-up via invitation: validates the token and requires its email to match the provider email before creating the OAuth account. */
const inviteCallbackFlow = async ({
  ctx,
  providerUser,
  provider,
  identity = null,
}: { ctx: Context<Env> } & BaseCallbackProps): Promise<OAuthFlowResult> => {
  const invitationToken = await getValidSingleUseToken({ ctx, tokenType: 'invitation' });

  if (invitationToken.email !== providerUser.email) {
    throw new AppError(409, 'oauth_wrong_email', 'error');
  }

  if (identity) throw new AppError(409, 'oauth_conflict', 'error');

  // Address already held by an account, verified or not: every sign-up writes its email row, so one lookup covers both.
  const holder = await findUserByEmail({ var: { db } }, { email: providerUser.email });
  if (holder) throw new AppError(409, 'oauth_email_exists', 'error');

  // No user match → create a new user and OAuth account atomically
  const newIdentity = await db.transaction(async (tx) => {
    const user = await handleCreateUser({ var: { db: tx } }, { newUser: providerUser, emailVerified: false });
    return createIdentity(tx, {
      userId: user.id,
      issuer: provider,
      subject: providerUser.id,
      email: providerUser.email,
    });
  });

  return { type: 'unverified', identity: newIdentity, reason: 'invite' };
};

const verifyCallbackFlow = async ({
  ctx,
  providerUser,
  provider,
  identity = null,
}: { ctx: Context<Env> } & BaseCallbackProps): Promise<OAuthFlowResult> => {
  const verifyToken = await getValidSingleUseToken({ ctx, tokenType: 'oauth-verification' });

  if (!identity) throw new AppError(400, 'oauth_failed', 'error');

  if (
    verifyToken.type !== 'oauth-verification' ||
    verifyToken.email !== providerUser.email ||
    verifyToken.identityId !== identity.id ||
    identity.issuer !== provider
  ) {
    throw new AppError(400, 'oauth_failed', 'error');
  }

  const user = await findUserById({ var: { db } }, { id: identity.userId });

  if (identity.verified) return { type: 'verified', user, identity };

  // Verify the identity and the address atomically
  const now = getIsoDate();
  await db.transaction(async (tx) => {
    await tx
      .update(identitiesTable)
      .set({ verified: true, verifiedAt: now, lastUsedAt: now })
      .where(and(eq(identitiesTable.id, identity.id), eq(identitiesTable.userId, user.id)));

    // The click proved the inbox: the account's own address is stamped, a differing provider address joins the ledger
    // (or is refused when another account holds it by now). Either way it is a magic-link sign-in identifier from here.
    if (verifyToken.email === user.email) {
      await requireEmailVerified(tx, { userId: user.id, email: verifyToken.email, by: provider });
    } else {
      await addProvenEmail(tx, { userId: user.id, email: verifyToken.email, by: provider });
    }
  });

  return { type: 'verified', user, identity };
};

type NewIdentity = Pick<IdentityModel, 'userId' | 'issuer' | 'subject'> & { email: UserModel['email'] };

const createIdentity = async (dbOrTx: DbOrTx, values: NewIdentity): Promise<IdentityModel> => {
  const [identity] = await dbOrTx
    .insert(identitiesTable)
    .values({ ...values, verified: false })
    .returning();

  return identity;
};

/**
 * Keeps an unverified identity's address snapshot at what the provider asserts now. The verification mail goes to the
 * snapshot and the verify click compares it with the provider's address, so a stale snapshot could never verify.
 */
const refreshIdentityEmail = async (identity: IdentityModel, providerUser: TransformedUser) => {
  if (identity.email === providerUser.email) return;
  await db.update(identitiesTable).set({ email: providerUser.email }).where(eq(identitiesTable.id, identity.id));
};

/** A sign-in through the identity: record the use and refresh the address snapshot to what the provider asserts now. */
const touchIdentity = async (identity: IdentityModel, providerUser: TransformedUser) => {
  await db
    .update(identitiesTable)
    .set({ lastUsedAt: getIsoDate(), email: providerUser.email })
    .where(eq(identitiesTable.id, identity.id));
};

/**
 * Post-callback handling: verified accounts may start an MFA challenge and/or set the session, then redirect to the post-login path.
 * Unverified accounts get a verification email and land on the email-verification page.
 */
const processCallbackResult = async (
  info: OAuthFlowResult & { ctx: Context<Env>; provider: EnabledOAuthProvider; redirectAfter?: string },
) => {
  const { ctx, type, identity, provider, redirectAfter } = info;
  // Stored on the verification token; null means "use the default path" at the final hop.
  const redirectAfterPath = isValidRedirectPath(redirectAfter) || null;

  if (type === 'verified') {
    return finishSignIn(ctx, info.user, provider, redirectAfter);
  }
  // Awaited so the verification token is persisted before the redirect to the "check your email" page.
  await sendOAuthVerificationEmail({
    userId: identity.userId,
    identityId: identity.id,
    redirectPath: redirectAfterPath,
  });

  const redirectUrl = new URL(`/auth/email-verification/${info.reason}?provider=${provider}`, appConfig.frontendUrl);

  return ctx.redirect(redirectUrl, 302);
};
