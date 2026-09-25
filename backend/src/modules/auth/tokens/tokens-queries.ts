import { and, desc, eq, getColumns, gt, inArray, isNull } from 'drizzle-orm';
import type { DbContext } from '#/core/context';
import type { DbOrTx } from '#/db/db';
import { tokensTable, type UnsafeTokenModel } from '#/modules/auth/tokens-db';
import { getIsoDate } from '#/utils/iso-date';

export type { PendingSignUp } from '#/modules/auth/tokens-db';

/** A token row without its secrets: the hashes of the raw value and of the single-use value stay in this module. */
export type TokenRecord = Omit<UnsafeTokenModel, 'secret' | 'singleUseToken'>;

const { secret: _secret, singleUseToken: _singleUseToken, ...safeColumns } = getColumns(tokensTable);

/** The columns of a {@link TokenRecord}, for the queries of this module. */
export const tokenColumns = safeColumns;

type InvitationTokenKey = { id: string } | { inactiveMembershipId: string };

interface FindInvitationTokenOpts {
  /** Lock the row for the caller's transaction, so a concurrent resend or answer waits for it. */
  forUpdate?: boolean;
}

/**
 * An invitation token by its own id, or the newest token of a membership invitation. Resolve an invitation by one of
 * these, never by its address: an address can hold newer tokens from other invitations.
 */
export const findInvitationToken = async (
  ctx: DbContext,
  key: InvitationTokenKey,
  { forUpdate = false }: FindInvitationTokenOpts = {},
): Promise<TokenRecord | undefined> => {
  const { db } = ctx.var;
  const byKey =
    'id' in key ? eq(tokensTable.id, key.id) : eq(tokensTable.inactiveMembershipId, key.inactiveMembershipId);
  const query = db
    .select(tokenColumns)
    .from(tokensTable)
    .where(and(eq(tokensTable.type, 'invitation'), byKey))
    .orderBy(desc(tokensTable.createdAt))
    .limit(1);
  const [token] = forUpdate ? await query.for('update') : await query;
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
    .where(
      and(eq(tokensTable.email, email), eq(tokensTable.type, 'invitation'), gt(tokensTable.expiresAt, getIsoDate())),
    )
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

/**
 * Invitation tokens as a subquery, for listings that show a membership invitation beside its emailed link: the
 * token's `id`, the `email` it went to and its `inactiveMembershipId`.
 */
export const invitationTokensSubquery = (db: DbOrTx) =>
  db
    .select({
      id: tokensTable.id,
      email: tokensTable.email,
      inactiveMembershipId: tokensTable.inactiveMembershipId,
    })
    .from(tokensTable)
    .where(eq(tokensTable.type, 'invitation'))
    .as('invitation_tokens');
