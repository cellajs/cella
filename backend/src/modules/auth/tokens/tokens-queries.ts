import { and, countDistinct, eq, getColumns, gt, inArray, isNull, or, type SQL, sql } from 'drizzle-orm';
import type { TokenKind } from 'shared';
import type { DbContext } from '#/core/context';
import { type CodeTokenKind, type LinkTokenKind, tokenPolicies } from '#/modules/auth/tokens/token-policies';
import { type InsertTokenModel, tokensTable, type UnsafeTokenModel } from '#/modules/auth/tokens/tokens-db';
import { hashToken } from '#/utils/hash-token';
import { getIsoDate } from '#/utils/iso-date';

export type { PendingSignUp } from '#/modules/auth/tokens/tokens-db';

/** A token row without its secrets: the hashes of the raw value and of the single-use value stay in this module. */
export type TokenRecord = Omit<UnsafeTokenModel, 'secretHash' | 'singleUseToken'>;

const { secretHash: _secretHash, singleUseToken: _singleUseToken, ...tokenColumns } = getColumns(tokensTable);

interface FindInvitationTokenOpts {
  id: string;
  /** Lock the row for the caller's transaction, so a concurrent resend waits for it. */
  forUpdate?: boolean;
}

/**
 * An invitation token by its own id. Resolve an invitation by it, never by its address: an address can hold newer
 * tokens from other invitations.
 */
export const findInvitationToken = async (ctx: DbContext, { id, forUpdate }: FindInvitationTokenOpts): Promise<TokenRecord | undefined> => {
  const query = ctx.var.db
    .select(tokenColumns)
    .from(tokensTable)
    .where(and(eq(tokensTable.kind, 'invitation'), eq(tokensTable.id, id)));
  const [token] = forUpdate ? await query.for('update') : await query;
  return token;
};

/**
 * An unexpired system invitation: one with no membership row. A membership invitation's token counts for nothing here:
 * its row decides, and its tokens go with the row.
 */
const liveSystemInvitation = () =>
  and(eq(tokensTable.kind, 'invitation'), isNull(tokensTable.inactiveMembershipId), gt(tokensTable.expiresAt, getIsoDate()));

/** Whether an unexpired system invitation is addressed to `email`. */
export const hasLiveSystemInvitationToken = async (ctx: DbContext, { email }: { email: string }) => {
  const [liveToken] = await ctx.var.db
    .select({ id: tokensTable.id })
    .from(tokensTable)
    .where(and(eq(tokensTable.email, email), liveSystemInvitation()))
    .limit(1);
  return !!liveToken;
};

/** How many addresses an unexpired system invitation is addressed to. */
export const countLiveSystemInvitations = async (ctx: DbContext) => {
  const [row] = await ctx.var.db
    .select({ count: countDistinct(tokensTable.email) })
    .from(tokensTable)
    .where(liveSystemInvitation());
  return row.count;
};

/** The unredeemed system invitations (no membership row) addressed to any of `emails`, expired ones included. */
export const findSystemInvitationTokens = async (ctx: DbContext, { emails }: { emails: string[] }) =>
  ctx.var.db
    .select({ id: tokensTable.id, email: tokensTable.email, expiresAt: tokensTable.expiresAt })
    .from(tokensTable)
    .where(
      and(
        inArray(tokensTable.email, emails),
        eq(tokensTable.kind, 'invitation'),
        isNull(tokensTable.inactiveMembershipId),
        isNull(tokensTable.redeemedAt),
      ),
    );

/** An answered or bound invitation is handled in-app, so its emailed links have no further use. */
export const deleteInvitationTokens = async (ctx: DbContext, { inactiveMembershipIds }: { inactiveMembershipIds: string[] }) => {
  if (!inactiveMembershipIds.length) return;
  await ctx.var.db.delete(tokensTable).where(inArray(tokensTable.inactiveMembershipId, inactiveMembershipIds));
};

/** Binds a token issued without an account to the account its sign-up link's redemption created; undefined when the token is bound already. */
export const updateTokenUser = async (ctx: DbContext, { id, userId }: { id: string; userId: string }) => {
  const [bound] = await ctx.var.db
    .update(tokensTable)
    .set({ userId })
    .where(and(eq(tokensTable.id, id), isNull(tokensTable.userId)))
    .returning(tokenColumns);
  return bound;
};

/** What decides which earlier tokens a new one replaces. */
type ReplacingToken = Pick<InsertTokenModel, 'kind' | 'email'> &
  Partial<Pick<InsertTokenModel, 'userId' | 'identityId' | 'inactiveMembershipId' | 'pendingSignUp' | 'sessionId'>>;

/**
 * Per token kind, the subject whose earlier tokens of that kind a new one deletes, so only the newest one for it works;
 * undefined deletes nothing.
 */
const replacementSubjects = {
  // Its address, and its account when it names one.
  magic: (token) =>
    token.userId ? or(eq(tokensTable.email, token.email), eq(tokensTable.userId, token.userId)) : eq(tokensTable.email, token.email),
  // Its identity, or the provider account signing up.
  'oauth-verification': ({ identityId, pendingSignUp }) => {
    if (identityId) return eq(tokensTable.identityId, identityId);
    if (!pendingSignUp) return undefined;
    return and(
      sql`${tokensTable.pendingSignUp}->>'provider' = ${pendingSignUp.provider}`,
      sql`${tokensTable.pendingSignUp}->>'subject' = ${pendingSignUp.subject}`,
    );
  },
  // Its membership invitation, or its address for a system invitation.
  invitation: (token) =>
    token.inactiveMembershipId
      ? eq(tokensTable.inactiveMembershipId, token.inactiveMembershipId)
      : and(eq(tokensTable.email, token.email), isNull(tokensTable.inactiveMembershipId)),
  // One connect pin per account at a time.
  'oauth-connect': (token) => (token.userId ? eq(tokensTable.userId, token.userId) : undefined),
  // One code per session at a time.
  'step-up': (token) => (token.sessionId ? eq(tokensTable.sessionId, token.sessionId) : undefined),
  // Every sign-in holds its own second-factor challenge.
  'confirm-mfa': () => undefined,
} satisfies Record<TokenKind, (token: ReplacingToken) => SQL | undefined>;

const replacedBy = (token: ReplacingToken): SQL | undefined => {
  const subject = replacementSubjects[token.kind](token);
  return subject && and(eq(tokensTable.kind, token.kind), subject);
};

/** Deletes the earlier tokens these new ones replace, so only the newest one for a subject works. */
export const deleteReplacedTokens = async (ctx: DbContext, { tokens }: { tokens: ReplacingToken[] }) => {
  const replaced = tokens.map(replacedBy).filter((filter) => filter !== undefined);
  if (replaced.length) await ctx.var.db.delete(tokensTable).where(or(...replaced));
};

/** Stores new tokens; returns the stored rows without their secrets. */
export const insertTokens = async (ctx: DbContext, { values }: { values: InsertTokenModel[] }) =>
  ctx.var.db.insert(tokensTable).values(values).returning(tokenColumns);

/** Names the token a link of `kind` carries, by the hash of the raw value in its URL. */
const namedBy = (kind: LinkTokenKind, rawToken: string) => and(eq(tokensTable.secretHash, hashToken(rawToken)), eq(tokensTable.kind, kind));

interface LinkTokenOpts {
  kind: LinkTokenKind;
  /** The raw value from the link. */
  rawToken: string;
}

/** The link token a raw value names, read without redeeming it; undefined when there is none. */
export const findLinkToken = async (ctx: DbContext, { kind, rawToken }: LinkTokenOpts): Promise<TokenRecord | undefined> => {
  const [token] = await ctx.var.db.select(tokenColumns).from(tokensTable).where(namedBy(kind, rawToken)).limit(1);
  return token;
};

/** Deletes the unredeemed link a raw value names: neither its URL nor a confirmation page redeems it any more. */
export const deleteUnredeemedLinkToken = async (ctx: DbContext, { kind, rawToken }: LinkTokenOpts) => {
  await ctx.var.db.delete(tokensTable).where(and(namedBy(kind, rawToken), isNull(tokensTable.redeemedAt)));
};

interface UpdateTokenRedeemedOpts {
  id: string;
  /** The hash of the single-use value the redeeming browser gets in its cookie. */
  singleUseToken: string;
  /** End of the single-use window, an ISO timestamp. */
  expiresAt: string;
}

/**
 * Redeems an unredeemed token now: a compare-and-set on `redeemedAt IS NULL`, so of two concurrent redemptions exactly
 * one gets the row. Undefined for the one that lost.
 */
export const updateTokenRedeemed = async (ctx: DbContext, { id, singleUseToken, expiresAt }: UpdateTokenRedeemedOpts) => {
  const [redeemed] = await ctx.var.db
    .update(tokensTable)
    .set({ singleUseToken, redeemedAt: getIsoDate(), expiresAt })
    .where(and(eq(tokensTable.id, id), isNull(tokensTable.redeemedAt)))
    .returning(tokenColumns);
  return redeemed;
};

/** Unbinds a redeemed token from the browser that redeemed it: no single-use cookie names it any more. */
export const updateTokenSpent = async (ctx: DbContext, { id }: { id: string }) => {
  await ctx.var.db.update(tokensTable).set({ singleUseToken: null }).where(eq(tokensTable.id, id));
};

/**
 * Names the row a browser's cookie of `kind` binds it to, by the hash of the cookie's value: after a link's redemption
 * the cookie holds its single-use value, a cookie-carried token's cookie holds the token itself.
 */
const boundTo = (kind: TokenKind, cookie: string) => {
  const hashedColumn = tokenPolicies[kind].carrier === 'link' ? tokensTable.singleUseToken : tokensTable.secretHash;
  return and(eq(tokensTable.kind, kind), eq(hashedColumn, hashToken(cookie)));
};

interface BoundTokenOpts {
  kind: TokenKind;
  /** The value of the browser's cookie of `kind`. */
  cookie: string;
}

/** The token a browser's cookie of `kind` binds it to, whatever its state; undefined when it names no row. */
export const findBoundToken = async (ctx: DbContext, { kind, cookie }: BoundTokenOpts) => {
  const [token] = await ctx.var.db.select(tokenColumns).from(tokensTable).where(boundTo(kind, cookie)).limit(1);
  return token;
};

/** Deletes the token a browser's cookie of `kind` binds it to; returns the deleted row, undefined when there was none. */
export const deleteBoundToken = async (ctx: DbContext, { kind, cookie }: BoundTokenOpts) => {
  const [spent] = await ctx.var.db.delete(tokensTable).where(boundTo(kind, cookie)).returning(tokenColumns);
  return spent;
};

interface DeleteSessionCodeTokenOpts {
  kind: CodeTokenKind;
  sessionId: string;
  /** The code as the user entered it. */
  code: string;
}

/**
 * Deletes the session's unexpired code token of `kind` when `code` matches it; returns the deleted row, undefined
 * otherwise. The session narrows the search first, so a guess can match only this session's code; a miss deletes nothing.
 */
export const deleteSessionCodeToken = async (ctx: DbContext, { kind, sessionId, code }: DeleteSessionCodeTokenOpts) => {
  const [spent] = await ctx.var.db
    .delete(tokensTable)
    .where(
      and(
        eq(tokensTable.kind, kind),
        eq(tokensTable.sessionId, sessionId),
        eq(tokensTable.secretHash, hashToken(code)),
        gt(tokensTable.expiresAt, getIsoDate()),
      ),
    )
    .returning(tokenColumns);
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
