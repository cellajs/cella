import { and, desc, eq, getColumns, gt, inArray, isNull, or, type SQL, sql } from 'drizzle-orm';
import type { TokenType } from 'shared';
import type { DbContext } from '#/core/context';
import { type LinkTokenType, type TokenReplacement, tokenPolicies } from '#/modules/auth/tokens/token-policies';
import { type InsertTokenModel, tokensTable, type UnsafeTokenModel } from '#/modules/auth/tokens-db';
import { hashToken } from '#/utils/hash-token';
import { getIsoDate } from '#/utils/iso-date';

export type { PendingSignUp } from '#/modules/auth/tokens-db';

/** A token row without its secrets: the hashes of the raw value and of the single-use value stay in this module. */
export type TokenRecord = Omit<UnsafeTokenModel, 'secret' | 'singleUseToken'>;

const { secret: _secret, singleUseToken: _singleUseToken, ...safeColumns } = getColumns(tokensTable);

/** The columns of a {@link TokenRecord}, for the queries of this module. */
export const tokenColumns = safeColumns;

/** By the token's own id, or by its membership invitation (the newest token). */
type FindInvitationTokenOpts = ({ id: string } | { inactiveMembershipId: string }) & {
  /** Lock the row for the caller's transaction, so a concurrent resend or answer waits for it. */
  forUpdate?: boolean;
};

/**
 * An invitation token by its own id, or the newest token of a membership invitation. Resolve an invitation by one of
 * these, never by its address: an address can hold newer tokens from other invitations.
 */
export const findInvitationToken = async (ctx: DbContext, opts: FindInvitationTokenOpts): Promise<TokenRecord | undefined> => {
  const { db } = ctx.var;
  const byKey = 'id' in opts ? eq(tokensTable.id, opts.id) : eq(tokensTable.inactiveMembershipId, opts.inactiveMembershipId);
  const query = db
    .select(tokenColumns)
    .from(tokensTable)
    .where(and(eq(tokensTable.type, 'invitation'), byKey))
    .orderBy(desc(tokensTable.createdAt))
    .limit(1);
  const [token] = opts.forUpdate ? await query.for('update') : await query;
  return token;
};

interface HasLiveInvitationTokenOpts {
  email: string;
}

/** Whether an unexpired invitation token is addressed to `email`: the trace a system invitation leaves. */
export const hasLiveInvitationToken = async (ctx: DbContext, { email }: HasLiveInvitationTokenOpts) => {
  const { db } = ctx.var;
  const [liveToken] = await db
    .select({ id: tokensTable.id })
    .from(tokensTable)
    .where(and(eq(tokensTable.email, email), eq(tokensTable.type, 'invitation'), gt(tokensTable.expiresAt, getIsoDate())))
    .limit(1);
  return !!liveToken;
};

interface FindSystemInvitationTokensOpts {
  emails: string[];
}

/** The unopened system invitations (no membership row) addressed to any of `emails`, expired ones included. */
export const findSystemInvitationTokens = async (ctx: DbContext, { emails }: FindSystemInvitationTokensOpts) => {
  const { db } = ctx.var;
  return db
    .select({ id: tokensTable.id, email: tokensTable.email, expiresAt: tokensTable.expiresAt })
    .from(tokensTable)
    .where(
      and(
        inArray(tokensTable.email, emails),
        eq(tokensTable.type, 'invitation'),
        isNull(tokensTable.inactiveMembershipId),
        isNull(tokensTable.invokedAt),
      ),
    );
};

interface DeleteInvitationTokensOpts {
  inactiveMembershipIds: string[];
}

/** An answered or bound invitation is handled in-app, so its emailed links have no further use. */
export const deleteInvitationTokens = async (ctx: DbContext, { inactiveMembershipIds }: DeleteInvitationTokensOpts) => {
  if (!inactiveMembershipIds.length) return;
  const { db } = ctx.var;
  await db.delete(tokensTable).where(inArray(tokensTable.inactiveMembershipId, inactiveMembershipIds));
};

interface BindTokenToUserOpts {
  tokenId: string;
  userId: string;
}

/** Binds a token sent to an address without an account to the account that has proven the address since. */
export const bindTokenToUser = async (ctx: DbContext, { tokenId, userId }: BindTokenToUserOpts) => {
  const { db } = ctx.var;
  return db
    .update(tokensTable)
    .set({ userId })
    .where(and(eq(tokensTable.id, tokenId), isNull(tokensTable.userId)));
};

/** What decides which earlier tokens a new one replaces. */
type ReplacingToken = Pick<InsertTokenModel, 'type' | 'email'> &
  Partial<Pick<InsertTokenModel, 'userId' | 'identityId' | 'inactiveMembershipId' | 'pendingSignUp' | 'sessionId'>>;

/** The subject each replacement rule names; undefined replaces nothing. See `tokenReplacements`. */
const replacementSubjects = {
  'address-or-account': (token) =>
    token.userId ? or(eq(tokensTable.email, token.email), eq(tokensTable.userId, token.userId)) : eq(tokensTable.email, token.email),
  identity: ({ identityId, pendingSignUp }) => {
    if (identityId) return eq(tokensTable.identityId, identityId);
    if (!pendingSignUp) return undefined;
    return and(
      sql`${tokensTable.pendingSignUp}->>'issuer' = ${pendingSignUp.issuer}`,
      sql`${tokensTable.pendingSignUp}->>'subject' = ${pendingSignUp.subject}`,
    );
  },
  invitation: (token) =>
    token.inactiveMembershipId
      ? eq(tokensTable.inactiveMembershipId, token.inactiveMembershipId)
      : and(eq(tokensTable.email, token.email), isNull(tokensTable.inactiveMembershipId)),
  account: (token) => (token.userId ? eq(tokensTable.userId, token.userId) : undefined),
  session: (token) => (token.sessionId ? eq(tokensTable.sessionId, token.sessionId) : undefined),
  none: () => undefined,
} satisfies Record<TokenReplacement, (token: ReplacingToken) => SQL | undefined>;

/** The earlier tokens a new one replaces, by its type's `replaces` rule. */
const replacedBy = (token: ReplacingToken): SQL | undefined => {
  const subject = replacementSubjects[tokenPolicies[token.type].replaces](token);
  return subject && and(eq(tokensTable.type, token.type), subject);
};

interface DeleteReplacedTokensOpts {
  /** The new tokens, about to be inserted. */
  tokens: ReplacingToken[];
}

/** Deletes the earlier tokens these new ones replace, so only the newest one for a subject works. */
export const deleteReplacedTokens = async (ctx: DbContext, { tokens }: DeleteReplacedTokensOpts) => {
  const replaced = tokens.map(replacedBy).filter((filter) => filter !== undefined);
  if (replaced.length) await ctx.var.db.delete(tokensTable).where(or(...replaced));
};

interface InsertTokensOpts {
  values: InsertTokenModel[];
}

export const insertTokens = async (ctx: DbContext, { values }: InsertTokensOpts) => {
  return ctx.var.db.insert(tokensTable).values(values).returning(tokenColumns);
};

interface FindLinkTokenOpts {
  type: LinkTokenType;
  /** The raw value from the link. */
  rawToken: string;
}

/** The link token a raw value names, read without redeeming it; undefined when there is none. */
export const findLinkToken = async (ctx: DbContext, { type, rawToken }: FindLinkTokenOpts): Promise<TokenRecord | undefined> => {
  const [token] = await ctx.var.db
    .select(tokenColumns)
    .from(tokensTable)
    .where(and(eq(tokensTable.secret, hashToken(rawToken)), eq(tokensTable.type, type)))
    .limit(1);
  return token;
};

interface DeleteUnopenedLinkTokenOpts {
  type: LinkTokenType;
  /** The raw value from the link. */
  rawToken: string;
}

/** Deletes the unopened link a raw value names, so neither its URL nor a confirmation page can redeem it any more. */
export const deleteUnopenedLinkToken = async (ctx: DbContext, { type, rawToken }: DeleteUnopenedLinkTokenOpts) => {
  const secret = hashToken(rawToken);
  await ctx.var.db.delete(tokensTable).where(and(eq(tokensTable.secret, secret), eq(tokensTable.type, type), isNull(tokensTable.invokedAt)));
};

interface UpdateTokenRedeemedOpts {
  id: string;
  /** The hash of the single-use value the redeeming browser gets in its cookie. */
  singleUseToken: string;
  /** End of the single-use window, an ISO timestamp. */
  expiresAt: string;
}

/**
 * Redeems an unopened token now: a compare-and-set on `invokedAt IS NULL`, so of two concurrent redemptions exactly
 * one gets the row. Undefined for the one that lost.
 */
export const updateTokenRedeemed = async (ctx: DbContext, { id, singleUseToken, expiresAt }: UpdateTokenRedeemedOpts) => {
  const [redeemed] = await ctx.var.db
    .update(tokensTable)
    .set({ singleUseToken, invokedAt: getIsoDate(), expiresAt })
    .where(and(eq(tokensTable.id, id), isNull(tokensTable.invokedAt)))
    .returning(tokenColumns);
  return redeemed;
};

interface UpdateTokenUserOpts {
  id: string;
  userId: string;
}

/** Binds a token to the account settled for it. */
export const updateTokenUser = async (ctx: DbContext, { id, userId }: UpdateTokenUserOpts) => {
  const [owned] = await ctx.var.db.update(tokensTable).set({ userId }).where(eq(tokensTable.id, id)).returning(tokenColumns);
  return owned;
};

/**
 * Names the row a browser's cookie of `type` binds it to, by the hash of the cookie's value: after a link's redemption
 * the cookie holds its single-use value, a cookie-carried token's cookie holds the token itself.
 */
const boundTo = (type: TokenType, cookie: string) => {
  const hashedColumn = tokenPolicies[type].carrier === 'link' ? tokensTable.singleUseToken : tokensTable.secret;
  return and(eq(tokensTable.type, type), eq(hashedColumn, hashToken(cookie)));
};

interface FindBoundTokenOpts {
  type: TokenType;
  /** The value of the browser's cookie of `type`. */
  cookie: string;
}

/** The token a browser's cookie of `type` binds it to, whatever its state; undefined when it names no row. */
export const findBoundToken = async (ctx: DbContext, { type, cookie }: FindBoundTokenOpts) => {
  const [token] = await ctx.var.db.select(tokenColumns).from(tokensTable).where(boundTo(type, cookie)).limit(1);
  return token;
};

interface DeleteBoundTokenOpts {
  type: TokenType;
  /** The value of the browser's cookie of `type`. */
  cookie: string;
}

/** Deletes the token a browser's cookie of `type` binds it to; returns the deleted row, undefined when there was none. */
export const deleteBoundToken = async (ctx: DbContext, { type, cookie }: DeleteBoundTokenOpts) => {
  const [spent] = await ctx.var.db.delete(tokensTable).where(boundTo(type, cookie)).returning(tokenColumns);
  return spent;
};

interface FindTokenBySingleUseOpts {
  id: string;
  /** The value of the browser's single-use cookie. */
  cookie: string;
}

/** The token with this id when the cookie holds its single-use value; undefined otherwise. */
export const findTokenBySingleUse = async (ctx: DbContext, { id, cookie }: FindTokenBySingleUseOpts) => {
  const [token] = await ctx.var.db
    .select(tokenColumns)
    .from(tokensTable)
    .where(and(eq(tokensTable.id, id), eq(tokensTable.singleUseToken, hashToken(cookie))))
    .limit(1);
  return token;
};
