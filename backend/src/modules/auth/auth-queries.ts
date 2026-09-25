import { and, desc, eq, getColumns, gt, isNull, type SQL } from 'drizzle-orm';
import type { DbContext } from '#/core/context';
import type { ActorId } from '#/db/utils/ids';
import { passkeysTable } from '#/modules/auth/passkeys/passkeys-db';
import { type SessionRevocationReason, sessionSafeColumns, sessionsTable } from '#/modules/auth/sessions-db';
import { tokensTable } from '#/modules/auth/tokens-db';
import { encryptTotpSecret } from '#/modules/auth/totps/helpers/totp-secret-encryption';
import { totpsTable } from '#/modules/auth/totps/totps-db';
import { inactiveMembershipsTable } from '#/modules/memberships/inactive-memberships-db';
import { emailsTable } from '#/modules/user/emails-db';
import { getIsoDate } from '#/utils/iso-date';

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

interface RevokeSessionsOpts {
  /** Which sessions; the live-row condition is added here. */
  filters: SQL[];
  reason: SessionRevocationReason;
  /** Null when the server revokes during a sign-in. */
  revokedBy: ActorId | null;
}

/**
 * Stamps the live sessions matching the filters and returns them, secret stripped. A revoked session is never
 * re-stamped, so the first revocation is the one the sessions list shows; the row itself stays until the sweep.
 */
export const revokeSessions = async (ctx: DbContext, { filters, reason, revokedBy }: RevokeSessionsOpts) => {
  const { db } = ctx.var;
  return db
    .update(sessionsTable)
    .set({ revokedAt: getIsoDate(), revokedBy, revocationReason: reason })
    .where(and(isNull(sessionsTable.revokedAt), ...filters))
    .returning(sessionSafeColumns);
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

  const [liveToken] = await db
    .select({ id: tokensTable.id })
    .from(tokensTable)
    .where(
      and(eq(tokensTable.email, email), eq(tokensTable.type, 'invitation'), gt(tokensTable.expiresAt, getIsoDate())),
    )
    .limit(1);
  return !!liveToken;
};

interface DeleteOAuthVerificationTokensOpts {
  userId: string;
  identityId: string;
}

/** A fresh verification mail replaces the user's earlier ones for that identity. */
export const deleteOAuthVerificationTokens = async (
  ctx: DbContext,
  { userId, identityId }: DeleteOAuthVerificationTokensOpts,
) => {
  const { db } = ctx.var;
  return db
    .delete(tokensTable)
    .where(
      and(
        eq(tokensTable.userId, userId),
        eq(tokensTable.type, 'oauth-verification'),
        eq(tokensTable.identityId, identityId),
      ),
    );
};
