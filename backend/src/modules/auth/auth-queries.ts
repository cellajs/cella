import { and, eq, getColumns, isNull, sql } from 'drizzle-orm';
import { appConfig } from 'shared';
import type { DbContext } from '#/core/context';
import { passkeysTable } from '#/modules/auth/passkeys/passkeys-db';
import { hasLiveInvitationToken } from '#/modules/auth/tokens/tokens-queries';
import { encryptTotpSecret } from '#/modules/auth/totps/helpers/totp-secret-encryption';
import { totpsTable } from '#/modules/auth/totps/totps-db';
import { inactiveMembershipsTable } from '#/modules/memberships/inactive-memberships-db';

interface FindCredentialIdsByUserOpts {
  userId: string;
}

export const findCredentialIdsByUser = async (ctx: DbContext, { userId }: FindCredentialIdsByUserOpts) => {
  const { db } = ctx.var;
  return db.select({ credentialId: passkeysTable.credentialId }).from(passkeysTable).where(eq(passkeysTable.userId, userId));
};

/**
 * Which second factors the user holds, in one query. Inside `mfaFactorRules.locked`, pass its transaction so the read
 * sees the change made there.
 */
export const heldFactors = async (ctx: DbContext, userId: string) => {
  const { db } = ctx.var;
  const { rows } = await db.execute<{ passkey: boolean; totp: boolean }>(sql`
    select exists (select 1 from ${passkeysTable} where ${passkeysTable.userId} = ${userId}) as passkey,
      exists (select 1 from ${totpsTable} where ${totpsTable.userId} = ${userId}) as totp`);
  return rows[0];
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
