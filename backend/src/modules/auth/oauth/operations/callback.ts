import type { Context } from 'hono';
import { appConfig, type EnabledOAuthProvider } from 'shared';
import type { DbContext, Env } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import { deleteAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { finishSignIn } from '#/modules/auth/general/operations/finish-sign-in';
import { maySignUp } from '#/modules/auth/invitations/operations/may-sign-up';
import type { TransformedUser } from '#/modules/auth/oauth/helpers/transform-user-data';
import type { IdentityModel } from '#/modules/auth/oauth/identities-db';
import { findIdentityBySubject, insertIdentity, updateIdentity } from '#/modules/auth/oauth/identities-queries';
import type { OAuthCookiePayload } from '#/modules/auth/oauth/oauth-schema';
import { sendOAuthVerificationEmail } from '#/modules/auth/oauth/operations/send-oauth-verification-email';
import { spendConnectPin } from '#/modules/auth/oauth/operations/spend-connect-pin';
import { readBoundToken, spendCookieToken } from '#/modules/auth/tokens/token-lifecycle';
import type { PendingSignUp, TokenRecord } from '#/modules/auth/tokens/tokens-queries';
import type { UserWithActivity } from '#/modules/user/helpers/select';
import { handleCreateUser } from '#/modules/user/operations/create-account';
import { addProvenEmail, requireEmailVerified } from '#/modules/user/operations/email-proof';
import { findUserByEmail, findUserById } from '#/modules/user/user-queries';
import { frontendRedirectPath } from '#/utils/frontend-redirect-path';
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
  const user = await spendConnectPin(ctx);

  if (identity) {
    if (identity.userId !== user.id) {
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
  if (holder && holder.id !== user.id) throw new AppError(409, 'oauth_conflict', 'warn');

  const newIdentity = await insertIdentity(dbCtx, {
    values: { userId: user.id, issuer: provider, subject: providerUser.id, email: providerUser.email },
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

/**
 * Completes a verification link opened in this browser, once the same provider account signed in again: a pending
 * sign-up creates its account, an identity on an account is verified with its address. Both spend the verification,
 * so one link signs in once.
 */
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

  if (verifyToken.email !== providerUser.email || verifyToken.identityId !== identity.id || identity.issuer !== provider) {
    throw new AppError(400, 'oauth_failed', 'error');
  }

  const user = await findUserById(dbCtx, { id: identity.userId });

  // Verify the identity and the address atomically, with the spend of the verification.
  const now = getIsoDate();
  await baseDb.transaction(async (tx) => {
    const txCtx = { var: { db: tx } };
    await spendVerification(ctx, txCtx, verifyToken);
    if (identity.verified) return;

    await updateIdentity(txCtx, { id: identity.id, userId: user.id, values: { verified: true, verifiedAt: now, lastUsedAt: now } });

    // The click proved the inbox: the account's own address is stamped, a differing provider address joins the ledger
    // (or is refused when another account holds it by now). Either way it is a magic-link sign-in identifier from here.
    if (verifyToken.email === user.email) {
      await requireEmailVerified(txCtx, { userId: user.id, email: verifyToken.email, via: provider });
    } else {
      await addProvenEmail(txCtx, { userId: user.id, email: verifyToken.email, via: provider });
    }
  });
  deleteAuthCookie(ctx, 'oauth-verification');

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

    await spendVerification(ctx, txCtx, verifyToken);

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
 * Spends the verification this browser holds in the caller's transaction: of two concurrent completions only the one
 * that spends it creates or verifies anything. Its cookie is the caller's to delete once that transaction commits.
 * @throws AppError 401 `oauth-verification_expired` when it was spent or expired meanwhile.
 */
const spendVerification = async (ctx: Context<Env>, txCtx: DbContext, verifyToken: TokenRecord) => {
  const spent = await spendCookieToken(ctx, 'oauth-verification', { deleteCookie: 'after-commit', txCtx });
  if (spent?.id !== verifyToken.id) throw new AppError(401, 'oauth-verification_expired', 'warn');
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
  const redirectAfterPath = frontendRedirectPath(redirectAfter);

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
