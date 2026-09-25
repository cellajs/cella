import { and, desc, eq, getColumns, isNull } from 'drizzle-orm';
import type { DbContext } from '#/core/context';
import { passkeysTable } from '#/modules/auth/passkeys/passkeys-db';
import { sessionsTable } from '#/modules/auth/sessions-db';
import { hasLiveInvitationToken } from '#/modules/auth/tokens/tokens-queries';
import { encryptTotpSecret } from '#/modules/auth/totps/helpers/totp-secret-encryption';
import { totpsTable } from '#/modules/auth/totps/totps-db';
import { inactiveMembershipsTable } from '#/modules/memberships/inactive-memberships-db';
import { emailsTable } from '#/modules/user/emails-db';

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

interface FindLatestSessionByUserOpts {
  userId: string;
}

/** The user's newest session that is not revoked: what stopping an impersonation hands the admin's browser back to. */
export const findLatestSessionByUser = async (ctx: DbContext, { userId }: FindLatestSessionByUserOpts) => {
  const { db } = ctx.var;
  const [session] = await db
    .select()
    .from(sessionsTable)
    .where(and(eq(sessionsTable.userId, userId), isNull(sessionsTable.revokedAt)))
    .orderBy(desc(sessionsTable.expiresAt))
    .limit(1);
  return session;
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

interface HasPendingInvitationOpts {
  email: string;
}

/**
 * Whether the address was invited and the invitation still stands: a membership invitation not rejected (it outlives
 * its emailed token), or a live invitation token (a system invite has no membership row).
 */
export const hasPendingInvitation = async (ctx: DbContext, { email }: HasPendingInvitationOpts) => {
  const { db } = ctx.var;

  const [membershipInvitation] = await db
    .select({ id: inactiveMembershipsTable.id })
    .from(inactiveMembershipsTable)
    .where(and(eq(inactiveMembershipsTable.email, email), isNull(inactiveMembershipsTable.rejectedAt)))
    .limit(1);
  if (membershipInvitation) return true;

  return hasLiveInvitationToken(ctx, { email });
};
