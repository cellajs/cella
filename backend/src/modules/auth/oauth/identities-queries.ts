import { and, eq, isNotNull } from 'drizzle-orm';
import type { DbContext } from '#/core/context';
import { type IdentityKind, type IdentityModel, type InsertIdentityModel, identitiesTable } from '#/modules/auth/oauth/identities-db';
import { getIsoDate } from '#/utils/iso-date';
import { pick } from '#/utils/pick';

interface FindIdentityBySubjectOpts {
  provider: string;
  /** The provider's own id for the account. */
  subject: string;
  /** The trust class the provider slug lives in; a social provider by default. */
  kind?: IdentityKind;
}

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

/** The user's verified OAuth identities: the provider, the address it asserted last, when it was linked and last signed in. */
export const findVerifiedOAuthIdentities = async (ctx: DbContext, { userId }: { userId: string }) =>
  ctx.var.db
    .select({
      provider: identitiesTable.provider,
      email: identitiesTable.email,
      createdAt: identitiesTable.createdAt,
      lastUsedAt: identitiesTable.lastUsedAt,
    })
    .from(identitiesTable)
    .where(and(eq(identitiesTable.userId, userId), eq(identitiesTable.kind, 'oauth'), eq(identitiesTable.verified, true)));

/** The user's SSO identities that still name the connection they came through. */
export const findSsoIdentities = async (ctx: DbContext, { userId }: { userId: string }) =>
  ctx.var.db
    .select(pick(identitiesTable, ['connectionId', 'email', 'createdAt', 'lastUsedAt']))
    .from(identitiesTable)
    .where(and(eq(identitiesTable.userId, userId), eq(identitiesTable.kind, 'sso'), isNotNull(identitiesTable.connectionId)));

interface InsertIdentityOpts {
  values: Pick<IdentityModel, 'userId' | 'provider' | 'subject'> &
    Pick<InsertIdentityModel, 'kind' | 'connectionId' | 'data'> & { email: string | null };
  /** Verified now, when an inbox proof in the same flow already stands for it, or the provider's assertion is the proof. */
  verified?: boolean;
}

/** Links an external account to a user; unverified unless `verified`. */
export const insertIdentity = async (ctx: DbContext, { values, verified = false }: InsertIdentityOpts): Promise<IdentityModel> => {
  const now = getIsoDate();
  const [identity] = await ctx.var.db
    .insert(identitiesTable)
    .values({ ...values, verified, ...(verified && { verifiedAt: now, lastUsedAt: now }) })
    .returning();
  return identity;
};

interface UpdateIdentityOpts {
  id: string;
  userId?: string;
  values: Partial<Pick<InsertIdentityModel, 'email' | 'verified' | 'verifiedAt' | 'lastUsedAt' | 'data' | 'connectionId'>>;
}

/** Writes `values` onto the identity; with `userId`, only when the identity belongs to that user. */
export const updateIdentity = async (ctx: DbContext, { id, userId, values }: UpdateIdentityOpts) => {
  await ctx.var.db
    .update(identitiesTable)
    .set(values)
    .where(and(eq(identitiesTable.id, id), userId ? eq(identitiesTable.userId, userId) : undefined));
};
