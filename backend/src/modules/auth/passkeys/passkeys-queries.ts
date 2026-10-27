import { and, eq, getColumns, lt, or } from 'drizzle-orm';
import type { DbContext } from '#/core/context';
import { passkeyChallengesTable } from '#/modules/auth/passkeys/passkey-challenges-db';
import { type InsertPasskeyModel, passkeysTable } from '#/modules/auth/passkeys/passkeys-db';
import { getIsoDate } from '#/utils/iso-date';

/** Every column but the credential id, public key and signature counter: what a response carries of a passkey. */
const { credentialId: _credentialId, publicKey: _publicKey, counter: _counter, ...passkeyColumns } = getColumns(passkeysTable);

interface FindCredentialIdsByUserOpts {
  userId: string;
}

/** The credential ids of the user's passkeys, which an MFA or step-up challenge offers the browser. */
export const findCredentialIdsByUser = async (ctx: DbContext, { userId }: FindCredentialIdsByUserOpts) => {
  return ctx.var.db.select({ credentialId: passkeysTable.credentialId }).from(passkeysTable).where(eq(passkeysTable.userId, userId));
};

interface FindPasskeysByUserOpts {
  userId: string;
}

/** The user's passkeys as a response carries them ({@link passkeyColumns}), for the account page. */
export const findPasskeysByUser = async (ctx: DbContext, { userId }: FindPasskeysByUserOpts) => {
  return ctx.var.db.select(passkeyColumns).from(passkeysTable).where(eq(passkeysTable.userId, userId));
};

interface FindPasskeyByCredentialIdOpts {
  credentialId: string;
  /** The account the passkey must belong to; any account when omitted. */
  userId?: string;
}

/** The passkey a credential id names, public key and counter included: for verifying an assertion, never for a response. */
export const findPasskeyByCredentialId = async (ctx: DbContext, { credentialId, userId }: FindPasskeyByCredentialIdOpts) => {
  const [passkey] = await ctx.var.db
    .select()
    .from(passkeysTable)
    .where(and(eq(passkeysTable.credentialId, credentialId), userId ? eq(passkeysTable.userId, userId) : undefined))
    .limit(1);
  return passkey;
};

interface InsertPasskeyOpts {
  values: InsertPasskeyModel;
}

/**
 * Stores a passkey and returns it as a response carries it ({@link passkeyColumns}); undefined when its credential id is
 * registered already, to this account or another.
 */
export const insertPasskey = async (ctx: DbContext, { values }: InsertPasskeyOpts) => {
  const [newPasskey] = await ctx.var.db
    .insert(passkeysTable)
    .values(values)
    .onConflictDoNothing({ target: passkeysTable.credentialId })
    .returning(passkeyColumns);
  return newPasskey;
};

interface UpdatePasskeyCounterOpts {
  id: string;
  counter: number;
}

/**
 * Stores the new signature counter only while the stored one is still lower (or both are 0, for an authenticator
 * without a counter); undefined otherwise, so of two copies of one authenticator answering at once, one fails.
 */
export const updatePasskeyCounter = async (ctx: DbContext, { id, counter }: UpdatePasskeyCounterOpts) => {
  const counterAdvances = counter > 0 ? lt(passkeysTable.counter, counter) : eq(passkeysTable.counter, 0);
  const [stored] = await ctx.var.db
    .update(passkeysTable)
    .set({ counter })
    .where(and(eq(passkeysTable.id, id), counterAdvances))
    .returning({ id: passkeysTable.id });
  return stored;
};

interface DeletePasskeyOpts {
  userId: string;
  id: string;
}

/** Deletes the user's passkey with this id; undefined when the user holds none by that id. */
export const deletePasskey = async (ctx: DbContext, { userId, id }: DeletePasskeyOpts) => {
  const [deleted] = await ctx.var.db
    .delete(passkeysTable)
    .where(and(eq(passkeysTable.userId, userId), eq(passkeysTable.id, id)))
    .returning({ id: passkeysTable.id, nameOnDevice: passkeysTable.nameOnDevice });
  return deleted;
};

interface InsertPasskeyChallengeOpts {
  values: typeof passkeyChallengesTable.$inferInsert;
}

/** Stores a challenge handed out to a browser. */
export const insertPasskeyChallenge = async (ctx: DbContext, { values }: InsertPasskeyChallengeOpts) => {
  await ctx.var.db.insert(passkeyChallengesTable).values(values);
};

interface DeleteStalePasskeyChallengesOpts {
  /** The challenge this browser held before, if any. */
  previousHash?: string;
}

/** Drops every expired challenge, and the one this browser held before. */
export const deleteStalePasskeyChallenges = async (ctx: DbContext, { previousHash }: DeleteStalePasskeyChallengesOpts) => {
  const expired = lt(passkeyChallengesTable.expiresAt, getIsoDate());
  await ctx.var.db.delete(passkeyChallengesTable).where(previousHash ? or(eq(passkeyChallengesTable.challengeHash, previousHash), expired) : expired);
};

interface DeletePasskeyChallengeOpts {
  challengeHash: string;
}

/** Takes a challenge out of play; returns what it was issued for, or undefined when it does not exist. */
export const deletePasskeyChallenge = async (ctx: DbContext, { challengeHash }: DeletePasskeyChallengeOpts) => {
  const [issued] = await ctx.var.db.delete(passkeyChallengesTable).where(eq(passkeyChallengesTable.challengeHash, challengeHash)).returning({
    purpose: passkeyChallengesTable.purpose,
    userId: passkeyChallengesTable.userId,
    expiresAt: passkeyChallengesTable.expiresAt,
  });
  return issued;
};
