import type { Context } from 'hono';
import { appConfig, type EnabledOAuthProvider } from 'shared';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import { deleteAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { finishSignIn } from '#/modules/auth/general/helpers/finish-sign-in';
import { maySignUp } from '#/modules/auth/invitations/operations/may-sign-up';
import type { TransformedUser } from '#/modules/auth/oauth/helpers/transform-user-data';
import type { IdentityModel } from '#/modules/auth/oauth/identities-db';
import { findIdentityBySubject, insertIdentity, updateIdentity } from '#/modules/auth/oauth/identities-queries';
import type { OAuthCookiePayload } from '#/modules/auth/oauth/oauth-schema';
import { sendOAuthVerificationEmail } from '#/modules/auth/oauth/operations/send-oauth-verification-email';
import { readBoundToken, spendCookieToken } from '#/modules/auth/tokens/token-lifecycle';
import type { PendingSignUp, TokenRecord } from '#/modules/auth/tokens/tokens-queries';
import type { UserWithActivity } from '#/modules/user/helpers/select';
import { handleCreateUser } from '#/modules/user/operations/create-account';
import { addProvenEmail, requireEmailVerified } from '#/modules/user/operations/email-proof';
import { findUserByEmail, findUserById } from '#/modules/user/user-queries';
import { isValidRedirectPath } from '#/utils/is-redirect-url';
import { getIsoDate } from '#/utils/iso-date';

/** Reads and writes outside a flow's transaction run on the base pool, whatever the route's context holds. */
const dbCtx = { var: { db: baseDb } };

type OAuthFlowResult =
  | { type: 'verified'; user: UserWithActivity; identity: IdentityModel }
  | {
      /** A provider account a proven user connected, awaiting the click on its verification mail. */
      type: 'unverified';
      identity: IdentityModel;
    }
  | {
      /** A sign-up without an account: it waits on the verification mail sent to the provider's address. */
      type: 'pending';
      signUp: PendingSignUp;
      email: string;
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
  const identity = await findIdentityBySubject(dbCtx, { issuer: provider, subject: providerUser.id });

  const baseCallbackProps = { providerUser, provider, identity };

  let result: OAuthFlowResult;

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

  return await processCallbackResult({ ctx, redirectAfter, provider, ...result });
};

/** Basic OAuth authentication and signup: existing verified account, unverified account, or a sign-up that waits on its verification mail. */
const authCallbackFlow = async ({ providerUser, provider, identity = null }: BaseCallbackProps): Promise<OAuthFlowResult> => {
  if (identity?.verified) {
    const user = await findUserById(dbCtx, { id: identity.userId });
    await touchIdentity(identity, providerUser);
    return { type: 'verified', user, identity };
  }

  // An unverified identity is a connect awaiting its mail: prompt the (re-)verification, mailed to the account's own address
  if (identity) {
    const user = await findUserById(dbCtx, { id: identity.userId });
    // Signed out, the provider holder has not shown they own this account, so verification never moves to another
    // inbox: proving that one would add it to the account and sign its holder in. Moving it takes connect, signed in.
    if (providerUser.email !== user.email) throw new AppError(409, 'oauth_conflict', 'warn');
    await refreshIdentityEmail(identity, providerUser);
    return { type: 'unverified', identity };
  }

  // Existing user (by email) found -> suggest sign in and connect
  const holder = await findUserByEmail(dbCtx, { email: providerUser.email });
  if (holder) throw new AppError(409, 'oauth_email_exists', 'warn');

  // The gate the sign-up's completion checks again: open registration, or an invitation to the address.
  if (!(await maySignUp(dbCtx, { email: providerUser.email }))) {
    throw new AppError(403, 'sign_up_restricted', 'info');
  }

  return pendingSignUp(providerUser, provider);
};

/** No account until the provider's address is proven: the sign-up waits on its verification mail. */
const pendingSignUp = (providerUser: TransformedUser, provider: EnabledOAuthProvider): OAuthFlowResult => {
  const { name, slug, firstName, lastName } = providerUser;
  const signUp = { issuer: provider, subject: providerUser.id, name, slug, firstName, lastName: lastName || undefined };
  return { type: 'pending', signUp, email: providerUser.email };
};

/**
 * Connects an OAuth provider to an existing user account: the account the `oauth-connect` pin names, which the user
 * issued signed in, right before leaving for the provider. The pin is spent here, so one start connects once; the
 * SameSite=Strict session cookie is absent on the provider's cross-site callback.
 */
const connectCallbackFlow = async ({
  ctx,
  providerUser,
  provider,
  identity = null,
}: { ctx: Context<Env> } & BaseCallbackProps): Promise<OAuthFlowResult> => {
  // Spent only while the session that issued it lives: a connect abandoned before a sign-out cannot be finished.
  const pin = await spendCookieToken(ctx, 'oauth-connect');
  if (!pin?.userId || !pin.sessionId) throw new AppError(401, 'oauth-connect_not_found', 'warn');
  const connectUserId = pin.userId;

  const user = await findUserById(dbCtx, { id: connectUserId });
  if (!user) throw new AppError(404, 'not_found', 'error', { entityType: 'user' });

  if (identity) {
    if (identity.userId !== connectUserId) {
      throw new AppError(409, 'oauth_conflict', 'warn');
    }

    if (identity.verified) {
      await touchIdentity(identity, providerUser);
      return { type: 'verified', user, identity };
    }

    await refreshIdentityEmail(identity, providerUser);
    return { type: 'unverified', identity };
  }

  // New OAuth account connection → validate email isn't used by another user
  const holder = await findUserByEmail(dbCtx, { email: providerUser.email });
  if (holder && holder.id !== connectUserId) throw new AppError(409, 'oauth_conflict', 'warn');

  const newIdentity = await insertIdentity(dbCtx, {
    values: { userId: connectUserId, issuer: provider, subject: providerUser.id, email: providerUser.email },
  });
  return { type: 'unverified', identity: newIdentity };
};

/**
 * Sign-up via invitation, for a provider account that asserts the invited address. An invitation link can be
 * forwarded, so opening it proves the inbox only together with the provider's own verification of the address: then
 * the account is created with its address and identity verified, in one transaction that also claims the invitations
 * waiting for the address, and signs in without a second mail. Otherwise the sign-up waits on the verification mail,
 * and completing it claims the invitations the same way.
 */
const inviteCallbackFlow = async ({
  ctx,
  providerUser,
  provider,
  identity = null,
}: { ctx: Context<Env> } & BaseCallbackProps): Promise<OAuthFlowResult> => {
  const invitationToken = await readBoundToken(ctx, 'invitation');
  // The error page resumes the invitation by its token id, so another sign-in method can be taken.
  const meta = { tokenId: invitationToken.id };

  if (invitationToken.email !== providerUser.email) throw new AppError(409, 'oauth_wrong_email', 'warn', { meta });

  if (identity) throw new AppError(409, 'oauth_conflict', 'warn', { meta });

  // Address already held by an account, verified or not: every sign-up writes its email row, so one lookup covers both.
  const holder = await findUserByEmail(dbCtx, { email: providerUser.email });
  if (holder) throw new AppError(409, 'oauth_email_exists', 'warn', { meta });

  if (!providerUser.emailVerified) return pendingSignUp(providerUser, provider);

  const { email } = invitationToken;
  const created = await baseDb.transaction(async (tx) => {
    const txCtx = { var: { db: tx } };
    const user = await handleCreateUser(txCtx, { newUser: providerUser, via: provider });
    const values = { userId: user.id, issuer: provider, subject: providerUser.id, email };
    const newIdentity = await insertIdentity(txCtx, { values, verified: true });
    return { userId: user.id, identity: newIdentity };
  });

  const user = await findUserById(dbCtx, { id: created.userId });
  return { type: 'verified', user, identity: created.identity };
};

const verifyCallbackFlow = async ({
  ctx,
  providerUser,
  provider,
  identity = null,
}: { ctx: Context<Env> } & BaseCallbackProps): Promise<OAuthFlowResult> => {
  const verifyToken = await readBoundToken(ctx, 'oauth-verification');

  const { pendingSignUp } = verifyToken;
  if (pendingSignUp) {
    return completeSignUp({ ctx, verifyToken, signUp: pendingSignUp, providerUser, provider, identity });
  }

  if (!identity) throw new AppError(400, 'oauth_failed', 'error');

  if (
    verifyToken.type !== 'oauth-verification' ||
    verifyToken.email !== providerUser.email ||
    verifyToken.identityId !== identity.id ||
    identity.issuer !== provider
  ) {
    throw new AppError(400, 'oauth_failed', 'error');
  }

  const user = await findUserById(dbCtx, { id: identity.userId });

  if (identity.verified) return { type: 'verified', user, identity };

  // Verify the identity and the address atomically
  const now = getIsoDate();
  await baseDb.transaction(async (tx) => {
    const txCtx = { var: { db: tx } };
    await updateIdentity(txCtx, { id: identity.id, userId: user.id, values: { verified: true, verifiedAt: now, lastUsedAt: now } });

    // The click proved the inbox: the account's own address is stamped, a differing provider address joins the ledger
    // (or is refused when another account holds it by now). Either way it is a magic-link sign-in identifier from here.
    if (verifyToken.email === user.email) {
      await requireEmailVerified(txCtx, { userId: user.id, email: verifyToken.email, via: provider });
    } else {
      await addProvenEmail(txCtx, { userId: user.id, email: verifyToken.email, via: provider });
    }
  });

  return { type: 'verified', user, identity };
};

/**
 * Finishes an OAuth sign-up in the browser that opened its verification mail, once the same provider account signed
 * in again: the click proved the inbox, so the account is created now with its address and identity verified, in one
 * transaction that spends the verification. An account or identity that appeared meanwhile ends the sign-up.
 * @throws AppError 403 `sign_up_restricted` when the address may no longer sign up; the verification stays unspent.
 */
const completeSignUp = async ({
  ctx,
  verifyToken,
  signUp,
  providerUser,
  provider,
  identity,
}: {
  ctx: Context<Env>;
  verifyToken: TokenRecord;
  signUp: PendingSignUp;
  providerUser: TransformedUser;
  provider: EnabledOAuthProvider;
  identity: IdentityModel | null;
}): Promise<OAuthFlowResult> => {
  const { email } = verifyToken;
  if (signUp.issuer !== provider || signUp.subject !== providerUser.id || email !== providerUser.email) {
    throw new AppError(400, 'oauth_failed', 'error');
  }

  if (identity) throw new AppError(409, 'oauth_conflict', 'warn');
  if (await findUserByEmail(dbCtx, { email })) throw new AppError(409, 'oauth_email_exists', 'warn');

  const created = await baseDb.transaction(async (tx) => {
    const txCtx = { var: { db: tx } };
    // Registration may have closed since the mail went out. Checked before the spend, so a refusal leaves the
    // verification and this browser's cookie as they were.
    if (!(await maySignUp(txCtx, { email }))) throw new AppError(403, 'sign_up_restricted', 'info');

    // Of two concurrent completions only the one that spends the verification creates the account.
    const spent = await spendCookieToken(ctx, 'oauth-verification', { deleteCookie: 'after-commit', txCtx });
    if (spent?.id !== verifyToken.id) throw new AppError(401, 'oauth-verification_expired', 'warn');

    const { name, slug, firstName, lastName } = signUp;
    const user = await handleCreateUser(txCtx, { newUser: { email, name, slug, firstName, lastName }, via: provider });
    const values = { userId: user.id, issuer: provider, subject: signUp.subject, email };
    const newIdentity = await insertIdentity(txCtx, { values, verified: true });
    return { userId: user.id, identity: newIdentity };
  });
  // The spend is committed: the cookie that named the verification goes with it.
  deleteAuthCookie(ctx, 'oauth-verification');

  const user = await findUserById(dbCtx, { id: created.userId });
  return { type: 'verified', user, identity: created.identity };
};

/**
 * Keeps an unverified identity's address snapshot at what the provider asserts now. The verification mail goes to the
 * snapshot and the verify click compares it with the provider's address, so a stale snapshot could never verify.
 */
const refreshIdentityEmail = async (identity: IdentityModel, providerUser: TransformedUser) => {
  if (identity.email === providerUser.email) return;
  await updateIdentity(dbCtx, { id: identity.id, values: { email: providerUser.email } });
};

/** A sign-in through the identity: record the use and refresh the address snapshot to what the provider asserts now. */
const touchIdentity = async (identity: IdentityModel, providerUser: TransformedUser) => {
  await updateIdentity(dbCtx, { id: identity.id, values: { lastUsedAt: getIsoDate(), email: providerUser.email } });
};

/**
 * Post-callback handling: verified accounts may start an MFA challenge and/or set the session, then redirect to the post-login path.
 * Unverified identities and pending sign-ups get a verification email and land on the email-verification page.
 */
const processCallbackResult = async (info: OAuthFlowResult & { ctx: Context<Env>; provider: EnabledOAuthProvider; redirectAfter?: string }) => {
  const { ctx, provider, redirectAfter } = info;
  // Stored on the verification token; null means "use the default path" at the final hop.
  const redirectAfterPath = isValidRedirectPath(redirectAfter);

  if (info.type === 'verified') {
    return finishSignIn(ctx, info.user, provider, redirectAfter);
  }

  // Awaited so the verification token is persisted before the redirect to the "check your email" page.
  if (info.type === 'pending') {
    await sendOAuthVerificationEmail({ signUp: info.signUp, email: info.email, redirectPath: redirectAfterPath });
  } else {
    await sendOAuthVerificationEmail({ userId: info.identity.userId, identityId: info.identity.id, redirectPath: redirectAfterPath });
  }

  const reason = info.type === 'pending' ? 'signup' : 'connect';
  const redirectUrl = new URL(`/auth/email-verification/${reason}?provider=${provider}`, appConfig.frontendUrl);

  return ctx.redirect(redirectUrl, 302);
};
