import { and, desc, eq, getColumns, type SQL } from 'drizzle-orm';
import type { DbContext } from '#/core/context';
import { passkeysTable } from '#/modules/auth/passkeys/passkeys-db';
import { sessionsTable } from '#/modules/auth/sessions-db';
import { tokensTable } from '#/modules/auth/tokens-db';
import { encryptTotpSecret } from '#/modules/auth/totps/helpers/totp-secret-encryption';
import { totpsTable } from '#/modules/auth/totps/totps-db';
import { inactiveMembershipsTable } from '#/modules/memberships/inactive-memberships-db';
import { emailsTable } from '#/modules/user/emails-db';
import { usersTable } from '#/modules/user/user-db';

interface FindCredentialIdsByUserOpts {
  userId: string;
}

export const findCredentialIdsByUser = async (ctx: DbContext, { userId }: FindCredentialIdsByUserOpts) => {
  const { db } = ctx.var;
  return db
    .select({ credentialId: passkeysTable.credentialId })
    .from(passkeysTable)
    .where(eq(passkeysTable.userId, userId));
};

interface FindUserIdByCredentialIdOpts {
  credentialId: string;
}

export const findUserIdByCredentialId = async (ctx: DbContext, { credentialId }: FindUserIdByCredentialIdOpts) => {
  const { db } = ctx.var;
  const [record] = await db
    .select({ userId: passkeysTable.userId })
    .from(passkeysTable)
    .where(eq(passkeysTable.credentialId, credentialId))
    .limit(1);
  return record;
};

interface FindUserMfaOpts {
  userId: string;
}

export const findExistingTotp = async (ctx: DbContext, { userId }: FindUserMfaOpts) => {
  const { db } = ctx.var;
  const [existing] = await db.select().from(totpsTable).where(eq(totpsTable.userId, userId)).limit(1);
  return existing;
};

export const findRemainingMfaMethods = async (ctx: DbContext, { userId }: FindUserMfaOpts) => {
  const { db } = ctx.var;
  const [passkeys, totps] = await Promise.all([
    db.select().from(passkeysTable).where(eq(passkeysTable.userId, userId)),
    db.select().from(totpsTable).where(eq(totpsTable.userId, userId)),
  ]);
  return { passkeys, totps };
};

export const disableMfa = async (ctx: DbContext, { userId }: FindUserMfaOpts) => {
  const { db } = ctx.var;
  return db.update(usersTable).set({ mfaRequired: false }).where(eq(usersTable.id, userId));
};

interface VerifyEmailOpts {
  email: string;
  verifiedAt: string;
}

export const verifyEmail = async (ctx: DbContext, { email, verifiedAt }: VerifyEmailOpts) => {
  const { db } = ctx.var;
  return db.update(emailsTable).set({ verified: true, verifiedAt }).where(eq(emailsTable.email, email));
};

interface InsertTotpOpts {
  userId: string;
  secret: string;
}

export const insertTotp = async (ctx: DbContext, { userId, secret }: InsertTotpOpts) => {
  const { db } = ctx.var;
  return db.insert(totpsTable).values({ userId, secret: encryptTotpSecret(secret) });
};

interface LinkTokenToUserOpts {
  tokenId: string;
  userId: string;
}

export const linkTokenToUser = async (ctx: DbContext, { tokenId, userId }: LinkTokenToUserOpts) => {
  const { db } = ctx.var;
  return db.update(tokensTable).set({ userId }).where(eq(tokensTable.id, tokenId));
};

interface FindLatestSessionByUserOpts {
  userId: string;
}

export const findLatestSessionByUser = async (ctx: DbContext, { userId }: FindLatestSessionByUserOpts) => {
  const { db } = ctx.var;
  const [session] = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.userId, userId))
    .orderBy(desc(sessionsTable.expiresAt))
    .limit(1);
  return session;
};

interface FindInvitationTokenOpts {
  filters: SQL[];
}

/** Find an invitation token matching the given filters (newest first). */
export const findInvitationToken = async (ctx: DbContext, { filters }: FindInvitationTokenOpts) => {
  const { db } = ctx.var;
  const [token] = await db
    .select()
    .from(tokensTable)
    .where(and(...filters))
    .orderBy(desc(tokensTable.createdAt))
    .limit(1);
  return token;
};

interface InsertInvitationTokenOpts {
  values: typeof tokensTable.$inferInsert;
}

export const insertInvitationToken = async (ctx: DbContext, { values }: InsertInvitationTokenOpts) => {
  const { db } = ctx.var;
  return db.insert(tokensTable).values(values);
};

interface FindInactiveMembershipByIdOpts {
  id: string;
}

export const findInactiveMembershipById = async (ctx: DbContext, { id }: FindInactiveMembershipByIdOpts) => {
  const { db } = ctx.var;
  const [membership] = await db.select().from(inactiveMembershipsTable).where(eq(inactiveMembershipsTable.id, id));
  return membership;
};

interface DeleteSessionOpts {
  sessionId: string;
  userId: string;
}

export const deleteSession = async (ctx: DbContext, { sessionId, userId }: DeleteSessionOpts) => {
  const { db } = ctx.var;
  return db.delete(sessionsTable).where(and(eq(sessionsTable.id, sessionId), eq(sessionsTable.userId, userId)));
};

interface InsertPasskeyOpts {
  values: typeof passkeysTable.$inferInsert;
}

/** Insert a passkey and return the created row (excluding credentialId and publicKey). */
export const insertPasskey = async (ctx: DbContext, { values }: InsertPasskeyOpts) => {
  const { db } = ctx.var;
  const { credentialId: _, publicKey: __, ...passkeySelect } = getColumns(passkeysTable);
  const [newPasskey] = await db.insert(passkeysTable).values(values).returning(passkeySelect);
  return newPasskey;
};
