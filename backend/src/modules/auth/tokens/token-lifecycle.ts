import type { Context } from 'hono';
import type { TokenType } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import { nanoid } from 'shared/utils/nanoid';
import type { DbContext, Env } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb, type Tx } from '#/db/db';
import { deleteAuthCookie, getAuthCookie, setAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { findSession } from '#/modules/auth/sessions/operations/resolve-session';
import { findLiveSession } from '#/modules/auth/sessions/sessions-queries';
import { type CookieTokenType, type LinkTokenType, tokenPolicies } from '#/modules/auth/tokens/token-policies';
import {
  deleteBoundToken,
  deleteReplacedTokens,
  findBoundToken,
  findLinkToken,
  findTokenBySingleUse,
  insertTokens,
  type TokenRecord,
  updateTokenRedeemed,
  updateTokenUser,
} from '#/modules/auth/tokens/tokens-queries';
import type { InsertTokenModel } from '#/modules/auth/tokens-db';
import { findUserByEmail } from '#/modules/user/user-queries';
import { hashToken } from '#/utils/hash-token';
import { isExpiredDate } from '#/utils/is-expired-date';
import { createDate } from '#/utils/time-span';

/** Token reads and writes without a caller's transaction run on the base pool, whatever the route's context holds. */
const dbCtx = { var: { db: baseDb } };

/** What a new token records besides its secret and expiry, which issuing sets. */
export type NewToken = Pick<InsertTokenModel, 'type' | 'email'> &
  Partial<Pick<InsertTokenModel, 'userId' | 'createdBy' | 'identityId' | 'inactiveMembershipId' | 'redirectPath' | 'pendingSignUp' | 'sessionId'>>;

/**
 * Issues tokens: a random raw value per token, stored only as its hash, expiring after its type's `ttl`. Each first
 * deletes the tokens it replaces (see `tokenReplacements`). Pass the caller's transaction in `ctx` when the issue must
 * commit with other writes.
 * @returns Per token, in the given order: the stored row and the raw value. The raw value exists only here; it goes
 *   into the link or cookie that carries the token.
 */
export const issueTokens = async (ctx: DbContext, tokens: NewToken[]): Promise<{ token: TokenRecord; rawToken: string }[]> => {
  if (!tokens.length) return [];

  await deleteReplacedTokens(ctx, { tokens });

  const issued = tokens.map((token) => ({ token, id: generateId(), rawToken: nanoid(40) }));
  const rows = await insertTokens(ctx, {
    values: issued.map(({ token, id, rawToken }) => ({
      id,
      type: token.type,
      email: token.email,
      userId: token.userId ?? null,
      createdBy: token.createdBy ?? null,
      identityId: token.identityId ?? null,
      inactiveMembershipId: token.inactiveMembershipId ?? null,
      redirectPath: token.redirectPath ?? null,
      pendingSignUp: token.pendingSignUp ?? null,
      sessionId: token.sessionId ?? null,
      secret: hashToken(rawToken),
      expiresAt: createDate(tokenPolicies[token.type].ttl),
    })),
  });

  const rowsById = new Map(rows.map((row) => [row.id, row]));
  return issued.map(({ id, rawToken }) => {
    const token = rowsById.get(id);
    if (!token) throw new AppError(500, 'server_error', 'error', { meta: { reason: 'token_not_stored' } });
    return { token, rawToken };
  });
};

/** {@link issueTokens} for one token. */
export const issueToken = async (ctx: DbContext, token: NewToken) => {
  const [issued] = await issueTokens(ctx, [token]);
  return issued;
};

/**
 * Issues a cookie-carried token (a second-factor challenge, a connect pin) and sets its cookie on this response for the
 * type's `ttl`. The raw value lives only in that cookie.
 */
export const issueCookieToken = async (ctx: Context<Env>, token: NewToken & { type: CookieTokenType }) => {
  const { token: record, rawToken } = await issueToken(dbCtx, token);
  await setAuthCookie(ctx, token.type, rawToken, tokenPolicies[token.type].ttl);
  return record;
};

/** An expired token's refusal names it by id, so an error page can offer a new link; never by its raw value. */
const expired = (token: TokenRecord) => new AppError(401, `${token.type}_expired`, 'warn', { meta: { tokenId: token.id } });

/**
 * Refuses a link that belongs to another account than the one this browser is signed in to. A link issued without an
 * account goes to its policy's `unboundOpener`: the account holding its address by now (a new account when nobody
 * does), or any signed-in account (an invitation not yet bound to a user, answered as that account).
 */
const refuseOtherAccount = async (ctx: Context<Env>, type: LinkTokenType, token: TokenRecord) => {
  if (!token.userId && tokenPolicies[type].unboundOpener === 'any-account') return;

  const signedIn = await findSession(ctx);
  if (!signedIn) return;

  const { user } = signedIn;
  const ownerId = token.userId ?? (await findUserByEmail(dbCtx, { email: token.email }))?.id;
  if (ownerId !== user.id) throw new AppError(409, 'user_mismatch', 'warn');
};

/**
 * The token, read fresh, when this browser holds its own single-use cookie. A cookie of the type's name proves nothing
 * by itself: it may come from another link of the same type.
 */
const heldByThisBrowser = async (ctx: Context<Env>, token: TokenRecord) => {
  const cookie = await getAuthCookie(ctx, token.type);
  if (!cookie) return null;

  const held = await findTokenBySingleUse(dbCtx, { id: token.id, cookie });
  return held && !isExpiredDate(held.expiresAt) ? held : null;
};

/**
 * Settles the account of a link issued without one, in the transaction that redeems it, and returns its user id: the
 * token is bound to that user. A throw rolls the redemption back, so the link stays unopened.
 */
export type ClaimTokenOwner = (tx: Tx, token: TokenRecord) => Promise<string>;

interface InvokeTokenOpts {
  type: LinkTokenType;
  /** The raw value from the link. */
  rawToken: string;
  /** For a link issued without an account (a sign-up link); runs only in the redemption that wins. */
  claimOwner?: ClaimTokenOwner;
}

/**
 * Redeems a link token (a magic link, an invitation or a verification link) from the raw value in its URL. The first
 * redemption wins a compare-and-set on `invokedAt`: the token's lifetime becomes its type's single-use window and this
 * browser gets the single-use cookie that binds the token to it. After that the link opens again only in the browser
 * holding that cookie, checked in SQL against the stored hash on a fresh read. A link issued without an account gets
 * its owner from `claimOwner`, committed with the redemption.
 * @returns The redeemed token.
 * @throws AppError 401 `<type>_not_found`, 401 `<type>_expired` (expired, or redeemed by another browser), 409
 *   `user_mismatch` while signed in to another account, or what `claimOwner` throws.
 */
export const invokeToken = async (ctx: Context<Env>, { type, rawToken, claimOwner }: InvokeTokenOpts): Promise<TokenRecord> => {
  const { singleUseWindow } = tokenPolicies[type];

  const token = await findLinkToken(dbCtx, { type, rawToken });
  if (!token) throw new AppError(401, `${type}_not_found`, 'warn');

  await refuseOtherAccount(ctx, type, token);

  if (isExpiredDate(token.expiresAt)) throw expired(token);

  if (token.invokedAt) {
    const held = await heldByThisBrowser(ctx, token);
    if (!held) throw expired(token);
    return held;
  }

  // Compare-and-set on `invokedAt IS NULL`: of two concurrent redemptions exactly one binds a browser.
  const rawSingleUse = nanoid(40);
  const redeem = (redeemCtx: DbContext) =>
    // Hash at rest: the raw value lives only in the browser's cookie.
    updateTokenRedeemed(redeemCtx, { id: token.id, singleUseToken: hashToken(rawSingleUse), expiresAt: createDate(singleUseWindow) });

  const redeemed =
    token.userId || !claimOwner
      ? await redeem(dbCtx)
      : await baseDb.transaction(async (tx) => {
          const txCtx = { var: { db: tx } };
          const won = await redeem(txCtx);
          if (!won) return won;
          const userId = await claimOwner(tx, won);
          return updateTokenUser(txCtx, { id: won.id, userId });
        });

  if (redeemed) {
    await setAuthCookie(ctx, type, rawSingleUse, singleUseWindow);
    return redeemed;
  }

  // Lost the race: the token is usable only in the browser that won it.
  const held = await heldByThisBrowser(ctx, token);
  if (!held) throw expired(token);
  return held;
};

/** The link types whose request the asking browser remembers, in a cookie named after the type. */
type RequestedLinkType = 'magic' | 'step-up';

/**
 * Remembers, in the browser that asked, which link it asked for, as long as the link lives: opening the link there
 * counts as the asking browser. The cookie is Lax (`cookie.ts`), since the click from the mail is a navigation another
 * site starts.
 */
export const rememberLinkRequest = (ctx: Context<Env>, type: RequestedLinkType, tokenId: string) =>
  setAuthCookie(ctx, `${type}-requested`, tokenId, tokenPolicies[type].ttl);

/** Whether this browser asked for the link: its marker for the type names the token. */
export const requestedHere = async (ctx: Context<Env>, type: RequestedLinkType, tokenId: string) =>
  (await getAuthCookie(ctx, `${type}-requested`)) === tokenId;

/** Drops the marker once the link is used: it has nothing left to say. */
export const forgetLinkRequest = (ctx: Context<Env>, type: RequestedLinkType) => deleteAuthCookie(ctx, `${type}-requested`);

/**
 * The live token this browser's cookie of `type` binds it to: a redeemed link (invitation, verification) or a
 * cookie-carried token (a second-factor challenge), for a flow that cannot go on without it. Reads only; nothing is
 * spent.
 * @throws AppError 401 `<type>_not_found` without a cookie or for a value that names no row, 401 `<type>_expired` once
 *   expired: one shape for a link and a cookie-carried type alike.
 */
export const readBoundToken = async (ctx: Context<Env>, type: TokenType): Promise<TokenRecord> => {
  const cookie = await getAuthCookie(ctx, type);
  const token = cookie ? await findBoundToken(dbCtx, { type, cookie }) : undefined;
  if (!token) throw new AppError(401, `${type}_not_found`, 'warn');
  if (isExpiredDate(token.expiresAt)) throw expired(token);

  return token;
};

/**
 * When the spend deletes this browser's cookie. `now`: the spend runs on the pool and is final at once. `after-commit`:
 * the spend runs in the caller's transaction, final only at its commit, so the cookie is the caller's to delete then;
 * a rollback leaves the browser its token for the next attempt.
 */
type SpendCookieTokenOpts = { deleteCookie: 'now' } | { deleteCookie: 'after-commit'; txCtx: DbContext };

/**
 * Spends the token this browser's cookie of `type` binds it to: deletes its row and, with `deleteCookie: 'now'`, the
 * cookie. A flow that grants something for the spend, such as a session after a second factor, goes on only with the
 * returned row: of two concurrent completions exactly one gets it. Call it once the proof has succeeded; a failed
 * attempt leaves the token for the next try.
 * A token issued for one session serves only that session: once it has ended, the token is spent without granting.
 * @returns The spent token, or null when there was nothing live to spend (no cookie, never issued, spent or expired,
 *   or its session has ended).
 */
export const spendCookieToken = async (
  ctx: Context<Env>,
  type: TokenType,
  opts: SpendCookieTokenOpts = { deleteCookie: 'now' },
): Promise<TokenRecord | null> => {
  const spendCtx = opts.deleteCookie === 'after-commit' ? opts.txCtx : dbCtx;
  const cookie = await getAuthCookie(ctx, type);
  if (opts.deleteCookie === 'now') deleteAuthCookie(ctx, type);
  if (!cookie) return null;

  const spent = await deleteBoundToken(spendCtx, { type, cookie });
  if (!spent || isExpiredDate(spent.expiresAt)) return null;
  if (spent.sessionId && !(await findLiveSession(spendCtx, { id: spent.sessionId }))) return null;
  return spent;
};
