import { and, eq, isNull, or, type SQL, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { TokenType } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import { nanoid } from 'shared/utils/nanoid';
import type { DbContext, Env } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb, type DbOrTx, type Tx } from '#/db/db';
import { deleteAuthCookie, getAuthCookie, setAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { getParsedSessionCookie, validateSession } from '#/modules/auth/general/helpers/session';
import { type CookieTokenType, type LinkTokenType, tokenPolicies } from '#/modules/auth/tokens/token-policies';
import { type TokenRecord, tokenColumns } from '#/modules/auth/tokens/tokens-queries';
import { type InsertTokenModel, tokensTable } from '#/modules/auth/tokens-db';
import { findUserByEmail } from '#/modules/user/user-queries';
import { hashToken } from '#/utils/hash-token';
import { isExpiredDate } from '#/utils/is-expired-date';
import { getIsoDate } from '#/utils/iso-date';
import { createDate } from '#/utils/time-span';

/** What a new token records besides its secret and expiry, which issuing sets. */
export type NewToken = Pick<InsertTokenModel, 'type' | 'email'> &
  Partial<
    Pick<
      InsertTokenModel,
      'userId' | 'createdBy' | 'identityId' | 'inactiveMembershipId' | 'redirectPath' | 'pendingSignUp'
    >
  >;

/**
 * The earlier tokens a new one replaces, so only the newest link for a subject works: a magic link per address and
 * per account, a verification link per identity or per provider account signing up, an invitation link per membership
 * invitation, or per address for a system invitation. Other types replace nothing: every sign-in holds its own
 * second-factor challenge.
 */
const replacedBy = (token: NewToken): SQL | undefined => {
  const sameType = eq(tokensTable.type, token.type);
  switch (token.type) {
    case 'magic':
      return and(
        sameType,
        token.userId
          ? or(eq(tokensTable.email, token.email), eq(tokensTable.userId, token.userId))
          : eq(tokensTable.email, token.email),
      );
    case 'oauth-verification': {
      if (token.identityId) return and(sameType, eq(tokensTable.identityId, token.identityId));
      const { pendingSignUp } = token;
      if (!pendingSignUp) return undefined;
      return and(
        sameType,
        sql`${tokensTable.pendingSignUp}->>'issuer' = ${pendingSignUp.issuer}`,
        sql`${tokensTable.pendingSignUp}->>'subject' = ${pendingSignUp.subject}`,
      );
    }
    case 'invitation':
      return and(
        sameType,
        token.inactiveMembershipId
          ? eq(tokensTable.inactiveMembershipId, token.inactiveMembershipId)
          : and(eq(tokensTable.email, token.email), isNull(tokensTable.inactiveMembershipId)),
      );
    default:
      return undefined;
  }
};

/**
 * Issues tokens: a random raw value per token, stored only as its hash, expiring after its type's `ttl`. Each first
 * deletes the tokens it replaces (see `replacedBy`). Pass the caller's transaction in `ctx` when the issue must commit
 * with other writes.
 * @returns Per token, in the given order: the stored row and the raw value. The raw value exists only here; it goes
 *   into the link or cookie that carries the token.
 */
export const issueTokens = async (
  ctx: DbContext,
  tokens: NewToken[],
): Promise<{ token: TokenRecord; rawToken: string }[]> => {
  if (!tokens.length) return [];
  const { db } = ctx.var;

  const replaced = tokens.map(replacedBy).filter((filter) => filter !== undefined);
  if (replaced.length) await db.delete(tokensTable).where(or(...replaced));

  const issued = tokens.map((token) => ({ token, id: generateId(), rawToken: nanoid(40) }));
  const rows = await db
    .insert(tokensTable)
    .values(
      issued.map(({ token, id, rawToken }) => ({
        id,
        type: token.type,
        email: token.email,
        userId: token.userId ?? null,
        createdBy: token.createdBy ?? null,
        identityId: token.identityId ?? null,
        inactiveMembershipId: token.inactiveMembershipId ?? null,
        redirectPath: token.redirectPath ?? null,
        pendingSignUp: token.pendingSignUp ?? null,
        secret: hashToken(rawToken),
        expiresAt: createDate(tokenPolicies[token.type].ttl),
      })),
    )
    .returning(tokenColumns);

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
 * Issues a cookie-carried token, a second-factor challenge, and sets its cookie on this response for the type's `ttl`.
 * The raw value lives only in that cookie.
 */
export const issueCookieToken = async (ctx: Context<Env>, token: NewToken & { type: CookieTokenType }) => {
  const { token: record, rawToken } = await issueToken({ var: { db: baseDb } }, token);
  await setAuthCookie(ctx, token.type, rawToken, tokenPolicies[token.type].ttl);
  return record;
};

/** An expired token's refusal names it by id, so an error page can offer a new link; never by its raw value. */
const expired = (token: TokenRecord) =>
  new AppError(401, `${token.type}_expired`, 'warn', { meta: { tokenId: token.id } });

/**
 * Refuses a link that belongs to another account than the one this browser is signed in to. A link issued without an
 * account (a sign-up link) belongs to whoever holds its address by now, and to a new account when nobody does. An
 * invitation not yet bound to a user is the exception: whoever holds it may answer it as their own account.
 */
const refuseOtherAccount = async (ctx: Context<Env>, token: TokenRecord) => {
  if (token.type === 'invitation' && !token.userId) return;

  const sessionToken = await getParsedSessionCookie(ctx).then(
    (cookie) => cookie.sessionToken,
    () => null,
  );
  if (!sessionToken) return;

  const { user } = await validateSession(sessionToken);
  const ownerId = token.userId ?? (await findUserByEmail({ var: { db: baseDb } }, { email: token.email }))?.id;
  if (ownerId !== user.id) throw new AppError(400, 'user_mismatch', 'warn');
};

/**
 * The token, read fresh, when this browser holds its own single-use cookie. A cookie of the type's name proves nothing
 * by itself: it may come from another link of the same type.
 */
const heldByThisBrowser = async (ctx: Context<Env>, token: TokenRecord) => {
  const cookie = await getAuthCookie(ctx, token.type);
  if (!cookie) return null;

  const [held] = await baseDb
    .select(tokenColumns)
    .from(tokensTable)
    .where(and(eq(tokensTable.id, token.id), eq(tokensTable.singleUseToken, hashToken(cookie))))
    .limit(1);
  return held && !isExpiredDate(held.expiresAt) ? held : null;
};

interface LinkTokenOpts {
  type: LinkTokenType;
  /** The raw value from the link. */
  rawToken: string;
}

/**
 * Settles the account of a link issued without one, in the transaction that redeems it, and returns its user id: the
 * token is bound to that user. A throw rolls the redemption back, so the link stays unopened.
 */
export type ClaimTokenOwner = (tx: Tx, token: TokenRecord) => Promise<string>;

interface InvokeTokenOpts extends LinkTokenOpts {
  /** For a link issued without an account (a sign-up link); runs only in the redemption that wins. */
  claimOwner?: ClaimTokenOwner;
}

/** The link token a raw value names, read without redeeming it; undefined when there is none. */
export const findLinkToken = async ({ type, rawToken }: LinkTokenOpts): Promise<TokenRecord | undefined> => {
  const [token] = await baseDb
    .select(tokenColumns)
    .from(tokensTable)
    .where(and(eq(tokensTable.secret, hashToken(rawToken)), eq(tokensTable.type, type)))
    .limit(1);
  return token;
};

/**
 * Redeems a link token (a magic link, an invitation or a verification link) from the raw value in its URL. The first
 * redemption wins a compare-and-set on `invokedAt`: the token's lifetime becomes its type's single-use window and this
 * browser gets the single-use cookie that binds the token to it. After that the link opens again only in the browser
 * holding that cookie, checked in SQL against the stored hash on a fresh read. A link issued without an account gets
 * its owner from `claimOwner`, committed with the redemption.
 * @returns The redeemed token.
 * @throws AppError 401 `<type>_not_found`, 401 `<type>_expired` (expired, or redeemed by another browser), 400
 *   `user_mismatch` while signed in to another account, or what `claimOwner` throws.
 */
export const invokeToken = async (
  ctx: Context<Env>,
  { type, rawToken, claimOwner }: InvokeTokenOpts,
): Promise<TokenRecord> => {
  const { singleUseWindow } = tokenPolicies[type];

  const token = await findLinkToken({ type, rawToken });
  if (!token) throw new AppError(401, `${type}_not_found`, 'warn');

  await refuseOtherAccount(ctx, token);

  if (isExpiredDate(token.expiresAt)) throw expired(token);

  if (token.invokedAt) {
    const held = await heldByThisBrowser(ctx, token);
    if (!held) throw expired(token);
    return held;
  }

  // Compare-and-set on `invokedAt IS NULL`: of two concurrent redemptions exactly one binds a browser.
  const rawSingleUse = nanoid(40);
  const redeem = async (db: DbOrTx) => {
    const [redeemed] = await db
      .update(tokensTable)
      .set({
        // Hash at rest: the raw value lives only in the browser's cookie.
        singleUseToken: hashToken(rawSingleUse),
        invokedAt: getIsoDate(),
        expiresAt: createDate(singleUseWindow),
      })
      .where(and(eq(tokensTable.id, token.id), isNull(tokensTable.invokedAt)))
      .returning(tokenColumns);
    return redeemed;
  };

  const redeemed =
    token.userId || !claimOwner
      ? await redeem(baseDb)
      : await baseDb.transaction(async (tx) => {
          const won = await redeem(tx);
          if (!won) return won;
          const userId = await claimOwner(tx, won);
          const [owned] = await tx
            .update(tokensTable)
            .set({ userId })
            .where(eq(tokensTable.id, won.id))
            .returning(tokenColumns);
          return owned;
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

/**
 * Names the row a browser's cookie of `type` binds it to, by the hash of the cookie's value: after a link's redemption
 * the cookie holds its single-use value, a cookie-carried token's cookie holds the token itself.
 */
const boundTo = (type: TokenType, cookie: string) => {
  const hashedColumn = tokenPolicies[type].carrier === 'link' ? tokensTable.singleUseToken : tokensTable.secret;
  return and(eq(tokensTable.type, type), eq(hashedColumn, hashToken(cookie)));
};

const selectBoundToken = async (type: TokenType, cookie: string) => {
  const [token] = await baseDb.select(tokenColumns).from(tokensTable).where(boundTo(type, cookie)).limit(1);
  return token;
};

/**
 * The live token this browser's cookie of `type` binds it to: a redeemed link (invitation, verification) or a
 * cookie-carried token (a second-factor challenge). Reads only; nothing is spent.
 * @returns The token, or null without a cookie, for an unknown value or once the token has expired.
 */
export const findBoundToken = async (ctx: Context<Env>, type: TokenType): Promise<TokenRecord | null> => {
  const cookie = await getAuthCookie(ctx, type);
  if (!cookie) return null;

  const token = await selectBoundToken(type, cookie);
  return token && !isExpiredDate(token.expiresAt) ? token : null;
};

/**
 * {@link findBoundToken} for a flow that cannot go on without the token. Reads only; nothing is spent.
 * @throws AppError for a link token 400 `invalid_token` without a cookie and 404 `<type>_not_found` without a row, for
 *   a cookie-carried token 401 `<type>_not_found` for either; 401 `<type>_expired` once expired.
 */
export const readBoundToken = async (ctx: Context<Env>, type: TokenType): Promise<TokenRecord> => {
  const isLink = tokenPolicies[type].carrier === 'link';

  const cookie = await getAuthCookie(ctx, type);
  if (!cookie) {
    throw isLink ? new AppError(400, 'invalid_token', 'warn') : new AppError(401, `${type}_not_found`, 'warn');
  }

  const token = await selectBoundToken(type, cookie);
  if (!token) {
    throw isLink ? new AppError(404, `${type}_not_found`, 'error') : new AppError(401, `${type}_not_found`, 'warn');
  }
  if (isExpiredDate(token.expiresAt)) throw expired(token);

  return token;
};

interface SpendCookieTokenOpts {
  /** The caller's transaction, when the spend must commit with its other writes. */
  db?: DbOrTx;
}

/**
 * Spends the token this browser's cookie of `type` binds it to: deletes its row and the cookie. A flow that grants
 * something for the spend, such as a session after a second factor, goes on only with the returned row: of two
 * concurrent completions exactly one gets it. Call it once the proof has succeeded; a failed attempt leaves the token
 * for the next try.
 * @returns The spent token, or null when there was nothing live to spend (no cookie, never issued, spent or expired).
 */
export const spendCookieToken = async (
  ctx: Context<Env>,
  type: TokenType,
  { db = baseDb }: SpendCookieTokenOpts = {},
): Promise<TokenRecord | null> => {
  const cookie = await getAuthCookie(ctx, type);
  deleteAuthCookie(ctx, type);
  if (!cookie) return null;

  const [spent] = await db.delete(tokensTable).where(boundTo(type, cookie)).returning(tokenColumns);
  return spent && !isExpiredDate(spent.expiresAt) ? spent : null;
};
