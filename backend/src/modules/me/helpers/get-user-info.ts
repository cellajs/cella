import type { z } from '@hono/zod-openapi';
import { and, desc, eq, getColumns } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbContext, Env } from '#/core/context';
import { oauthAccountsTable } from '#/db/schema/oauth-accounts';
import { passkeysTable } from '#/db/schema/passkeys';
import { sessionsTable } from '#/db/schema/sessions';
import { totpsTable } from '#/db/schema/totps';
import { getParsedSessionCookie } from '#/modules/auth/general/helpers/session';
import type { sessionSchema } from '#/modules/me/me-schema';

/**
 * Fetches all authentication-related data for a user in parallel.
 *
 * This includes:
 * - Passkeys (excluding sensitive fields like credentialId & publicKey)
 * - TOTP entries
 * - Verified OAuth accounts
 *
 * @param db - Database connection
 * @param userId - ID of the user to fetch auth data for
 * @returns An object containing arrays of passkeys, TOTP entries, and OAuth providers
 */
export const getAuthInfo = async (ctx: DbContext, { userId }: { userId: string }) => {
  const { db } = ctx.var;
  const { credentialId, publicKey, ...passkeySelect } = getColumns(passkeysTable);
  const getPasskeys = db.select(passkeySelect).from(passkeysTable).where(eq(passkeysTable.userId, userId));

  const getTotp = db.select().from(totpsTable).where(eq(totpsTable.userId, userId));

  // Query to get verified OAuth accounts
  const getOAuth = db
    .select({ provider: oauthAccountsTable.provider })
    .from(oauthAccountsTable)
    .where(and(eq(oauthAccountsTable.userId, userId), eq(oauthAccountsTable.verified, true)));

  const [passkeys, totps, oauth] = await Promise.all([getPasskeys, getTotp, getOAuth]);
  return { passkeys, hasTotp: !!totps.length, oauth };
};

/**
 * Retrieves all sessions for a specific user, and marks the current session.
 *
 * @param ctx - Request/response context.
 * @param userId - ID of the user whose sessions are requested.
 * @returns A list of sessions, with an additional `isCurrent` flag indicating if the session is the current active session.
 */
export const getUserSessions = async (ctx: Context<Env>, userId: string): Promise<z.infer<typeof sessionSchema>[]> => {
  const db = ctx.var.db;
  const sessions = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.userId, userId))
    .orderBy(desc(sessionsTable.createdAt));
  const { sessionToken } = await getParsedSessionCookie(ctx);

  // Destructure/remove secret from response
  return sessions.map(({ secret, ...session }) => ({ ...session, isCurrent: sessionToken === secret }));
};
