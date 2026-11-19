import { and, eq, isNotNull, sql } from 'drizzle-orm';
import type { DbContext } from '#/core/context';
import { type IdentityKind, type IdentityModel, type InsertIdentityModel, identitiesTable } from '#/modules/user/identities-db';
import { getIsoDate } from '#/utils/iso-date';
import { pick } from '#/utils/pick';

interface FindIdentityBySubjectOpts {
  provider: string;
  /** The provider's own id for the account. */
  subject: string;
  /** The trust class the provider slug lives in; a social provider by default. */
  kind?: IdentityKind;
}

/**
 * Holds an identity's key (kind, provider, subject) until the caller's transaction ends, found or not: two flows that
 * find or make the identity of one subject run one after the other, and the second finds what the first made.
 */
export const lockIdentityKey = async (ctx: DbContext, { provider, subject, kind }: Required<FindIdentityBySubjectOpts>) => {
  await ctx.var.db.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`identity:${kind}:${provider}:${subject}`}, 0))`);
};

/** The identity an external account is: keyed on (kind, provider, subject), never on its address. */
export const findIdentityBySubject = async (ctx: DbContext, { provider, subject, kind = 'oauth' }: FindIdentityBySubjectOpts) => {
  const [identity] = await ctx.var.db
    .select()
    .from(identitiesTable)
    .where(and(eq(identitiesTable.kind, kind), eq(identitiesTable.provider, provider), eq(identitiesTable.subject, subject)));
  return identity;
};

/** The identity with this id, of any kind; undefined when it is gone. */
export const findIdentityById = async (ctx: DbContext, { id }: { id: string }) => {
  const [identity] = await ctx.var.db.select().from(identitiesTable).where(eq(identitiesTable.id, id)).limit(1);
  return identity;
};

/** How many external accounts, of any kind, link to the user. */
export const countUserIdentities = async (ctx: DbContext, { userId }: { userId: string }) =>
  ctx.var.db.$count(identitiesTable, eq(identitiesTable.userId, userId));

/** The user's verified OAuth identities: the provider, the address it asserted last, when it was linked and last signed in. */
export const findVerifiedOAuthIdentities = async (ctx: DbContext, { userId }: { userId: string }) =>
  ctx.var.db
    .select({
      provider: identitiesTable.provider,
      email: identitiesTable.email,
      createdAt: identitiesTable.createdAt,
      lastUsedAt: identitiesTable.lastSignInAt,
    })
    .from(identitiesTable)
    .where(and(eq(identitiesTable.userId, userId), eq(identitiesTable.kind, 'oauth'), isNotNull(identitiesTable.verifiedAt)));

/** The user's SSO identities that still name the connection they came through. */
export const findSsoIdentities = async (ctx: DbContext, { userId }: { userId: string }) =>
  ctx.var.db
    .select(pick(identitiesTable, ['connectionId', 'email', 'createdAt', 'lastSignInAt']))
    .from(identitiesTable)
    .where(and(eq(identitiesTable.userId, userId), eq(identitiesTable.kind, 'sso'), isNotNull(identitiesTable.connectionId)));

interface InsertIdentityOpts {
  values: Pick<IdentityModel, 'userId' | 'provider' | 'subject'> &
    Pick<InsertIdentityModel, 'kind' | 'connectionId' | 'data' | 'verifiedAt' | 'lastSignInAt'> & { email: string | null };
  /** Verified now, when an inbox proof in the same flow already stands for it, or the provider's assertion is the proof. */
  verified?: boolean;
}

/** Links an external account to a user; unverified unless `verified`. */
export const insertIdentity = async (ctx: DbContext, { values, verified = false }: InsertIdentityOpts): Promise<IdentityModel> => {
  const now = getIsoDate();
  const [identity] = await ctx.var.db
    .insert(identitiesTable)
    .values({ ...values, ...(verified && { verifiedAt: now, lastSignInAt: now }) })
    .returning();
  return identity;
};

interface UpdateIdentityOpts {
  id: string;
  userId?: string;
  values: Partial<Pick<InsertIdentityModel, 'email' | 'verifiedAt' | 'lastSignInAt' | 'data' | 'connectionId'>>;
}

/** Writes `values` onto the identity; with `userId`, only when the identity belongs to that user. */
export const updateIdentity = async (ctx: DbContext, { id, userId, values }: UpdateIdentityOpts) => {
  await ctx.var.db
    .update(identitiesTable)
    .set(values)
    .where(and(eq(identitiesTable.id, id), userId ? eq(identitiesTable.userId, userId) : undefined));
};
