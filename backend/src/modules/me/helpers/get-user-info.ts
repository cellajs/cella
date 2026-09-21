import type { z } from '@hono/zod-openapi';
import { and, desc, eq, getColumns } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbContext, Env } from '#/core/context';
import { getParsedSessionCookie } from '#/modules/auth/general/helpers/session';
import { identitiesTable } from '#/modules/auth/identities-db';
import { passkeysTable } from '#/modules/auth/passkeys/passkeys-db';
import { sessionsTable } from '#/modules/auth/sessions-db';
import { totpsTable } from '#/modules/auth/totps/totps-db';
import type { sessionSchema } from '#/modules/me/me-schema';

/** Fetches passkeys (minus the sensitive credentialId/publicKey), whether TOTP is set, and verified OAuth providers. */
export const getAuthInfo = async (ctx: DbContext, { userId }: { userId: string }) => {
  const { db } = ctx.var;
  const { credentialId, publicKey, ...passkeySelect } = getColumns(passkeysTable);
  const getPasskeys = db.select(passkeySelect).from(passkeysTable).where(eq(passkeysTable.userId, userId));

  const getTotp = db.select().from(totpsTable).where(eq(totpsTable.userId, userId));

  const getOAuth = db
    .select({ provider: identitiesTable.issuer })
    .from(identitiesTable)
    .where(
      and(eq(identitiesTable.userId, userId), eq(identitiesTable.kind, 'oauth'), eq(identitiesTable.verified, true)),
    );

  const [passkeys, totps, oauth] = await Promise.all([getPasskeys, getTotp, getOAuth]);
  return { passkeys, hasTotp: !!totps.length, oauth };
};

/** Returns a user's sessions (newest first, secret stripped), each flagged with `isCurrent`. */
export const getUserSessions = async (ctx: Context<Env>, userId: string): Promise<z.infer<typeof sessionSchema>[]> => {
  const db = ctx.var.db;
  const sessions = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.userId, userId))
    .orderBy(desc(sessionsTable.createdAt));
  const { sessionToken } = await getParsedSessionCookie(ctx);

  return sessions.map(({ secret, ...session }) => ({ ...session, isCurrent: sessionToken === secret }));
};
