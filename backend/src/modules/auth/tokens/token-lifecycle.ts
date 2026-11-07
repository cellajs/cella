import { randomInt } from 'node:crypto';
import type { Context } from 'hono';
import { appConfig, type TokenKind } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import type { DbContext, Env } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb, type Tx } from '#/db/db';
import { deleteAuthCookie, getAuthCookie, setAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { findSession } from '#/modules/auth/sessions/operations/resolve-session';
import { findLiveSession } from '#/modules/auth/sessions/sessions-queries';
import { type CodeTokenKind, type CookieTokenKind, type HeldLinkKind, type LinkTokenKind, tokenPolicies } from '#/modules/auth/tokens/token-policies';
import type { InsertTokenModel } from '#/modules/auth/tokens/tokens-db';
import {
  deleteBoundToken,
  deleteOpenedLinkTokens,
  deleteReplacedTokens,
  deleteSessionCodeToken,
  findBoundToken,
  findLinkToken,
  findTokenBySingleUse,
  insertTokens,
  type TokenRecord,
  updateTokenRedeemed,
  updateTokenUser,
} from '#/modules/auth/tokens/tokens-queries';
import { findUserByEmail } from '#/modules/user/user-queries';
import { hashToken, newHashedToken } from '#/utils/hash-token';
import { isExpiredDate } from '#/utils/is-expired-date';
import { isoDateIn } from '#/utils/iso-date';
import { TimeSpan } from '#/utils/time-span';

/** Token reads and writes without a caller's transaction run on the base pool, whatever the route's context holds. */
const dbCtx = { var: { db: baseDb } };

/** A code token's raw value and its hash: as many digits as an authenticator code, so the client enters both in one input. */
const newHashedCode = () => {
  const raw = randomInt(0, 10 ** appConfig.totp.digits)
    .toString()
    .padStart(appConfig.totp.digits, '0');
  return { raw, hash: hashToken(raw) };
};

/** What a new token records besides its secret and expiry, which issuing sets; its id too, unless the caller drew one. */
export type NewToken = Pick<InsertTokenModel, 'kind' | 'email'> &
  Partial<
    Pick<
      InsertTokenModel,
      | 'id'
      | 'userId'
      | 'createdBy'
      | 'identityId'
      | 'inactiveMembershipId'
      | 'followedInvitationId'
      | 'redirectPath'
      | 'pendingSignUp'
      | 'sessionId'
      | 'authStrategy'
      | 'connectionId'
    >
  >;

/**
 * Issues tokens: a random raw value per token, stored only as its hash, expiring after its kind's `ttl`. Each first
 * deletes the tokens it replaces (`deleteReplacedTokens`). Pass the caller's transaction in `ctx` when the issue must
 * commit with other writes.
 * @returns Per token, in the given order: the stored row and the raw value. The raw value exists only here; it goes
 *   into the link or cookie that carries the token.
 */
export const issueTokens = async (ctx: DbContext, tokens: NewToken[]): Promise<{ token: TokenRecord; rawToken: string }[]> => {
  if (!tokens.length) return [];

  await deleteReplacedTokens(ctx, { tokens });

  const issued = tokens.map((token) => ({
    token,
    id: token.id ?? generateId(),
    ...(tokenPolicies[token.kind].carrier === 'code' ? newHashedCode() : newHashedToken()),
  }));
  const rows = await insertTokens(ctx, {
    values: issued.map(({ token, id, hash }) => ({
      id,
      kind: token.kind,
      email: token.email,
      userId: token.userId ?? null,
      createdBy: token.createdBy ?? null,
      identityId: token.identityId ?? null,
      inactiveMembershipId: token.inactiveMembershipId ?? null,
      followedInvitationId: token.followedInvitationId ?? null,
      redirectPath: token.redirectPath ?? null,
      pendingSignUp: token.pendingSignUp ?? null,
      sessionId: token.sessionId ?? null,
      authStrategy: token.authStrategy ?? null,
      connectionId: token.connectionId ?? null,
      secret: hash,
      expiresAt: isoDateIn(tokenPolicies[token.kind].ttl),
    })),
  });

  const rowsById = new Map(rows.map((row) => [row.id, row]));
  return issued.map(({ id, raw }) => {
    const token = rowsById.get(id);
    if (!token) throw new AppError(500, 'server_error', 'error', { meta: { reason: 'token_not_stored' } });
    return { token, rawToken: raw };
  });
};

/** {@link issueTokens} for one token. */
export const issueToken = async (ctx: DbContext, token: NewToken) => {
  const [issued] = await issueTokens(ctx, [token]);
  return issued;
};

/**
 * Issues a cookie-carried token (a second-factor challenge, a connect pin) and sets its cookie on this response for the
 * kind's `ttl`. The raw value lives only in that cookie.
 */
export const issueCookieToken = async (ctx: Context<Env>, token: NewToken & { kind: CookieTokenKind }) => {
  const { token: record, rawToken } = await issueToken(dbCtx, token);
  setAuthCookie(ctx, token.kind, rawToken, tokenPolicies[token.kind].ttl);
  return record;
};

/** An expired token's refusal names it by id, so an error page can offer a new link; never by its raw value. */
const expired = (token: TokenRecord) => new AppError(401, `${token.kind}_expired`, 'warn', { meta: { tokenId: token.id } });

/**
 * The refusal of a redeemed link this browser does not hold. An invitation is refused as opened, not expired, while its
 * own lifetime runs: the redemption shortened `expiresAt` to the single-use window, and a fresh link still works.
 */
const refuseRedeemed = (token: TokenRecord) => {
  if (token.kind !== 'invitation') return expired(token);
  const lifetimeEnd = new Date(token.createdAt).getTime() + tokenPolicies.invitation.ttl.milliseconds();
  if (Date.now() >= lifetimeEnd) return expired(token);
  return new AppError(401, 'invitation_opened', 'warn', { meta: { tokenId: token.id } });
};

/**
 * Refuses a link that belongs to another account than the one this browser is signed in to. A link issued without an
 * account belongs to the account holding its address by now (a new account when nobody does), except an invitation not
 * yet bound to a user: any signed-in account opens it, and only one holding its address accepts it.
 */
const refuseOtherAccount = async (ctx: Context<Env>, kind: LinkTokenKind, token: TokenRecord) => {
  if (!token.userId && kind === 'invitation') return;

  const signedIn = await findSession(ctx);
  if (!signedIn) return;

  const { user } = signedIn;
  const holderId = token.userId ?? (await findUserByEmail(dbCtx, { email: token.email }))?.id;
  if (holderId !== user.id) throw new AppError(409, 'user_mismatch', 'warn');
};

/**
 * The token, read fresh, when this browser holds its own single-use cookie. A cookie of the kind's name proves nothing
 * by itself: it may come from another link of the same kind.
 */
const heldByThisBrowser = async (ctx: Context<Env>, token: TokenRecord) => {
  const cookie = getAuthCookie(ctx, token.kind);
  if (!cookie) return null;

  const held = await findTokenBySingleUse(dbCtx, { id: token.id, cookie });
  return held && !isExpiredDate(held.expiresAt) ? held : null;
};

/**
 * Settles the account of a link issued without one, in the transaction that redeems it, and returns its user id: the
 * token is bound to that user. A throw rolls the redemption back, so the link stays unopened.
 */
type ClaimTokenHolder = (tx: Tx, token: TokenRecord) => Promise<string>;

interface InvokeTokenOpts {
  kind: LinkTokenKind;
  /** The raw value in the link's URL; the database holds only its hash. */
  rawToken: string;
  /** For a link issued without an account (a sign-up link); runs only in the redemption that wins. */
  claimHolder?: ClaimTokenHolder;
}

/**
 * The link a raw value names, refused as redeeming it would refuse it; `redeemed` when this browser redeemed it before
 * and holds its single-use cookie, which a fresh read checks against the stored hash.
 */
const checkLinkToken = async (ctx: Context<Env>, kind: LinkTokenKind, rawToken: string) => {
  const token = await findLinkToken(dbCtx, { kind, rawToken });
  if (!token) throw new AppError(401, `${kind}_not_found`, 'warn');

  await refuseOtherAccount(ctx, kind, token);

  if (token.invokedAt) {
    const held = await heldByThisBrowser(ctx, token);
    if (!held) throw refuseRedeemed(token);
    return { token: held, redeemed: true };
  }

  if (isExpiredDate(token.expiresAt)) throw expired(token);
  return { token, redeemed: false };
};

/**
 * Redeems a link token (a magic link, an invitation or a verification link) from the raw value in its URL. The first
 * redemption wins a compare-and-set on `invokedAt`: the token's lifetime becomes its kind's single-use window and this
 * browser gets the single-use cookie that binds the token to it. After that the link opens again only in the browser
 * holding that cookie. A link issued without an account gets its holder from `claimHolder`, committed with the
 * redemption.
 * @returns The redeemed token.
 * @throws AppError 401 `<kind>_not_found`, 401 `<kind>_expired` (expired, or redeemed by another browser), 401
 *   `invitation_opened` for an invitation redeemed by another browser or earlier, 409 `user_mismatch` while signed in
 *   to another account, or what `claimHolder` throws.
 */
export const invokeToken = async (ctx: Context<Env>, { kind, rawToken, claimHolder }: InvokeTokenOpts): Promise<TokenRecord> => {
  const { singleUseWindow } = tokenPolicies[kind];

  const { token, redeemed: redeemedBefore } = await checkLinkToken(ctx, kind, rawToken);
  if (redeemedBefore) return token;

  // Compare-and-set on `invokedAt IS NULL`: of two concurrent redemptions exactly one binds a browser.
  const singleUse = newHashedToken();
  const redeem = (redeemCtx: DbContext) =>
    updateTokenRedeemed(redeemCtx, { id: token.id, singleUseToken: singleUse.hash, expiresAt: isoDateIn(singleUseWindow) });

  const redeemed =
    token.userId || !claimHolder
      ? await redeem(dbCtx)
      : await baseDb.transaction(async (tx) => {
          const txCtx = { var: { db: tx } };
          const won = await redeem(txCtx);
          if (!won) return won;
          const userId = await claimHolder(tx, won);
          return updateTokenUser(txCtx, { id: won.id, userId });
        });

  if (redeemed) {
    setAuthCookie(ctx, kind, singleUse.raw, singleUseWindow);
    return redeemed;
  }

  // Lost the race: the token is usable only in the browser that won it.
  const held = await heldByThisBrowser(ctx, token);
  if (!held) throw refuseRedeemed(token);
  return held;
};

/** How long a link opened in a browser waits there, in its `<kind>-pending` cookie, for its holder to confirm it. */
export const heldLinkLifetime = new TimeSpan(10, 'm');

/**
 * Opens an invitation or verification link on a GET, which redeems nothing (RFC 9110 §9.2.1), so a mail scanner that
 * fetches the link leaves it unused. A link this browser redeemed before comes back to go on with; any other one that
 * redeeming would accept is held in this browser's `<kind>-pending` cookie until the app's page confirms it with a
 * POST (`redeemHeldLink`).
 * @returns The token this browser redeemed before, or null once the link is held.
 * @throws What `invokeToken` throws, before anything is held.
 */
export const holdLinkToken = async (ctx: Context<Env>, kind: HeldLinkKind, rawToken: string): Promise<TokenRecord | null> => {
  const { token, redeemed } = await checkLinkToken(ctx, kind, rawToken);
  if (redeemed) return token;

  setAuthCookie(ctx, `${kind}-pending`, rawToken, heldLinkLifetime);
  return null;
};

/**
 * Redeems the link this browser holds (`holdLinkToken`), on the POST from the app's page, and drops the hold.
 * @throws AppError 401 `link_not_held` when this browser holds none (the hold lapsed while the page stayed open, or a
 *   sign-out cleared it), whatever state the link is in, else what `invokeToken` throws.
 */
export const redeemHeldLink = async (ctx: Context<Env>, kind: HeldLinkKind): Promise<TokenRecord> => {
  const rawToken = getAuthCookie(ctx, `${kind}-pending`);
  if (!rawToken) throw new AppError(401, 'link_not_held', 'info');

  const token = await invokeToken(ctx, { kind, rawToken });
  deleteAuthCookie(ctx, `${kind}-pending`);
  return token;
};

/** The link kinds whose request the asking browser remembers, in a cookie named after the kind. */
type RequestedLinkKind = 'magic';

/**
 * Remembers, in the browser that asked, which link it asked for, as long as the link lives: opening the link there
 * counts as the asking browser. The cookie is Lax (`cookie.ts`), since the click from the mail is a navigation another
 * site starts.
 */
export const rememberLinkRequest = (ctx: Context<Env>, kind: RequestedLinkKind, tokenId: string) =>
  setAuthCookie(ctx, `${kind}-requested`, tokenId, tokenPolicies[kind].ttl);

/** Whether this browser asked for the link: its marker for the kind names the token. */
export const isRequestedHere = (ctx: Context<Env>, kind: RequestedLinkKind, tokenId: string) => getAuthCookie(ctx, `${kind}-requested`) === tokenId;

/** Drops the marker once the link is used: it has nothing left to say. */
export const forgetLinkRequest = (ctx: Context<Env>, kind: RequestedLinkKind) => deleteAuthCookie(ctx, `${kind}-requested`);

/** The token this browser's cookie of `kind` binds it to, whatever its state; undefined without one. */
const findCookieBoundToken = async (ctx: Context<Env>, kind: TokenKind) => {
  const cookie = getAuthCookie(ctx, kind);
  return cookie ? findBoundToken(dbCtx, { kind, cookie }) : undefined;
};

/**
 * The live token this browser's cookie of `kind` binds it to: a redeemed link (invitation, verification) or a
 * cookie-carried token (a second-factor challenge), for a flow that cannot go on without it. Reads only; nothing is
 * spent.
 * @throws AppError 401 `<kind>_not_found` without a cookie or for a value that names no row, 401 `<kind>_expired` once
 *   expired: one shape for a link and a cookie-carried kind alike.
 */
export const readBoundToken = async (ctx: Context<Env>, kind: TokenKind): Promise<TokenRecord> => {
  const token = await findCookieBoundToken(ctx, kind);
  if (!token) throw new AppError(401, `${kind}_not_found`, 'warn');
  if (isExpiredDate(token.expiresAt)) throw expired(token);

  return token;
};

/** {@link readBoundToken} for a flow that goes on without the token: null when this browser binds no live one. */
export const findLiveBoundToken = async (ctx: Context<Env>, kind: TokenKind): Promise<TokenRecord | null> => {
  const token = await findCookieBoundToken(ctx, kind);
  return token && !isExpiredDate(token.expiresAt) ? token : null;
};

interface IssueCodeTokenOpts {
  kind: CodeTokenKind;
  userId: string;
  email: string;
  /** The session that enters the code: the only one it serves. */
  sessionId: string;
}

/**
 * Issues an emailed code for one session, replacing the session's earlier code of the kind.
 * @returns The stored row and the code, which exists only here and in the mail.
 */
export const issueCodeToken = async ({ kind, userId, email, sessionId }: IssueCodeTokenOpts) => {
  const { token, rawToken } = await issueToken(dbCtx, { kind, userId, email, createdBy: userId, sessionId });
  return { token, code: rawToken };
};

interface SpendCodeTokenOpts {
  kind: CodeTokenKind;
  sessionId: string;
  code: string;
}

/**
 * Spends the session's emailed code of `kind` when `code` matches it. A wrong code leaves the token for the next try;
 * the caller's rate limiter counts the misses.
 * @returns The spent token, or null for a wrong, expired or never issued code.
 */
export const spendCodeToken = async (opts: SpendCodeTokenOpts): Promise<TokenRecord | null> => (await deleteSessionCodeToken(dbCtx, opts)) ?? null;

/**
 * When the spend deletes this browser's cookie. `now`: the spend runs on the pool and is final at once. `after-commit`:
 * the spend runs in `txCtx`, the caller's transaction (the pool when left out), and the cookie is the caller's to delete
 * once the spend and every write it goes with committed; a failure before leaves the browser its token for the next
 * attempt.
 */
type SpendCookieTokenOpts = { deleteCookie: 'now' } | { deleteCookie: 'after-commit'; txCtx?: DbContext };

/**
 * Spends the token this browser's cookie of `kind` binds it to: deletes its row and, with `deleteCookie: 'now'`, the
 * cookie. A flow that grants something for the spend, such as a session after a second factor, goes on only with the
 * returned row: of two concurrent completions exactly one gets it. Call it once the proof has succeeded; a failed
 * attempt leaves the token for the next try.
 * A token issued for one session serves only that session: once it has ended, the token is spent without granting.
 * @returns The spent token, or null when there was nothing live to spend (no cookie, never issued, spent or expired,
 *   or its session has ended).
 */
export const spendCookieToken = async (
  ctx: Context<Env>,
  kind: TokenKind,
  opts: SpendCookieTokenOpts = { deleteCookie: 'now' },
): Promise<TokenRecord | null> => {
  const spendCtx = opts.deleteCookie === 'after-commit' ? (opts.txCtx ?? dbCtx) : dbCtx;
  const cookie = getAuthCookie(ctx, kind);
  if (opts.deleteCookie === 'now') deleteAuthCookie(ctx, kind);
  if (!cookie) return null;

  const spent = await deleteBoundToken(spendCtx, { kind, cookie });
  if (!spent || isExpiredDate(spent.expiresAt)) return null;
  if (spent.sessionId && !(await findLiveSession(spendCtx, { id: spent.sessionId }))) return null;
  return spent;
};

/**
 * Deletes the user's opened magic link, so the browser that opened it cannot sign in from it again within its
 * single-use window: for a session end where the person leaves. An account holds one magic link at a time, as a new one
 * replaces the older, so this is the link any session of the user may have come from.
 */
export const deleteOpenedMagicLink = (ctx: DbContext, userId: string) => deleteOpenedLinkTokens(ctx, { kind: 'magic', userId });
