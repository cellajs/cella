import { and, eq } from 'drizzle-orm';
import type { DbContext } from '#/core/context';
import { type IdentityModel, type InsertIdentityModel, identitiesTable } from '#/modules/auth/oauth/identities-db';
import { getIsoDate } from '#/utils/iso-date';

interface FindIdentityBySubjectOpts {
  issuer: string;
  /** The issuer's own id for the account. */
  subject: string;
}

/** The OAuth identity a provider account is: keyed on the provider's subject, never on its address. */
export const findIdentityBySubject = async (ctx: DbContext, { issuer, subject }: FindIdentityBySubjectOpts) => {
  const [identity] = await ctx.var.db
    .select()
    .from(identitiesTable)
    .where(and(eq(identitiesTable.kind, 'oauth'), eq(identitiesTable.issuer, issuer), eq(identitiesTable.subject, subject)));
  return identity;
};

interface FindIdentityByIdOpts {
  id: string;
}

export const findIdentityById = async (ctx: DbContext, { id }: FindIdentityByIdOpts) => {
  const [identity] = await ctx.var.db.select().from(identitiesTable).where(eq(identitiesTable.id, id)).limit(1);
  return identity;
};

interface FindVerifiedOAuthIdentitiesOpts {
  userId: string;
}

/** The providers of the user's verified OAuth identities. */
export const findVerifiedOAuthIdentities = async (ctx: DbContext, { userId }: FindVerifiedOAuthIdentitiesOpts) => {
  return ctx.var.db
    .select({ provider: identitiesTable.issuer })
    .from(identitiesTable)
    .where(and(eq(identitiesTable.userId, userId), eq(identitiesTable.kind, 'oauth'), eq(identitiesTable.verified, true)));
};

interface InsertIdentityOpts {
  values: Pick<IdentityModel, 'userId' | 'issuer' | 'subject'> & { email: string };
  /** Verified now, when an inbox proof in the same flow already stands for it. */
  verified?: boolean;
}

/** Links a provider account to a user; unverified unless `verified`. */
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
  /** Only when the identity belongs to this user. */
  userId?: string;
  values: Partial<Pick<InsertIdentityModel, 'email' | 'verified' | 'verifiedAt' | 'lastUsedAt'>>;
}

export const updateIdentity = async (ctx: DbContext, { id, userId, values }: UpdateIdentityOpts) => {
  await ctx.var.db
    .update(identitiesTable)
    .set(values)
    .where(and(eq(identitiesTable.id, id), userId ? eq(identitiesTable.userId, userId) : undefined));
};
