import { and, eq, getColumns, isNull } from 'drizzle-orm';
import { appConfig } from 'shared';
import type { DbContext } from '#/core/context';
import { passkeysTable } from '#/modules/auth/passkeys/passkeys-db';
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
  /** The time step of the code that confirmed the setup. */
  lastUsedStep: number;
}

export const insertTotp = async (ctx: DbContext, { userId, secret, lastUsedStep }: InsertTotpOpts) => {
  const { db } = ctx.var;
  return db.insert(totpsTable).values({ userId, secret: encryptTotpSecret(secret), lastUsedStep });
};

interface InsertPasskeyOpts {
  values: typeof passkeysTable.$inferInsert;
}

/**
 * Insert a passkey and return the created row (excluding credentialId and publicKey), or undefined when its credential
 * id is registered already, to this account or another.
 */
export const insertPasskey = async (ctx: DbContext, { values }: InsertPasskeyOpts) => {
  const { db } = ctx.var;
  const { credentialId: _, publicKey: __, ...passkeySelect } = getColumns(passkeysTable);
  const [newPasskey] = await db
    .insert(passkeysTable)
    .values(values)
    .onConflictDoNothing({ target: passkeysTable.credentialId })
    .returning(passkeySelect);
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

/**
 * Whether a new account may be created for the address: registration is open, or an invitation to it still stands.
 * Sign-ups check it again when they complete, since either may have changed after the sign-up started.
 */
export const maySignUp = async (ctx: DbContext, { email }: HasPendingInvitationOpts) =>
  appConfig.has.selfRegistration || hasPendingInvitation(ctx, { email });
