import type { z } from '@hono/zod-openapi';
import { and, desc, eq, getColumns, gt, isNull, or, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbContext, Env } from '#/core/context';
import { devicesTable } from '#/modules/auth/devices-db';
import { getParsedSessionCookie } from '#/modules/auth/general/helpers/session';
import { identitiesTable } from '#/modules/auth/identities-db';
import { passkeysTable } from '#/modules/auth/passkeys/passkeys-db';
import { sessionsTable } from '#/modules/auth/sessions-db';
import { totpsTable } from '#/modules/auth/totps/totps-db';
import type { sessionSchema } from '#/modules/me/me-schema';
import { TimeSpan } from '#/utils/time-span';

/** How long a browser counts as new in the sessions list: one session lifetime. */
const NEW_DEVICE_WINDOW = new TimeSpan(1, 'w');

/** How long a revoked session stays in the list; the sweep drops a row 30 days after its expiry, so nothing lingers longer. */
const REVOKED_SESSION_WINDOW = new TimeSpan(30, 'd');

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

/**
 * Returns a user's sessions (newest first, secret stripped): the live and expired ones, and those revoked in the last
 * 30 days, each flagged with `isCurrent` and `isNewDevice`. A device is new when it was first seen within the window
 * and the user has an older device, so an account's first browser never counts.
 */
export const getUserSessions = async (ctx: Context<Env>, userId: string): Promise<z.infer<typeof sessionSchema>[]> => {
  const db = ctx.var.db;
  // Compared in SQL: the columns are timestamps without zone, which JavaScript would parse as local time.
  const revokedSince = new Date(Date.now() - REVOKED_SESSION_WINDOW.milliseconds()).toISOString();
  const getSessions = db
    .select()
    .from(sessionsTable)
    .where(
      and(
        eq(sessionsTable.userId, userId),
        or(isNull(sessionsTable.revokedAt), gt(sessionsTable.revokedAt, revokedSince)),
      ),
    )
    .orderBy(desc(sessionsTable.createdAt));
  const windowStart = new Date(Date.now() - NEW_DEVICE_WINDOW.milliseconds()).toISOString();
  const oldestFirstSeen = sql`(select min(${devicesTable.firstSeenAt}) from ${devicesTable} where ${devicesTable.userId} = ${userId})`;
  const getNewDevices = db
    .select({ deviceIdHash: devicesTable.deviceIdHash })
    .from(devicesTable)
    .where(
      and(
        eq(devicesTable.userId, userId),
        gt(devicesTable.firstSeenAt, windowStart),
        gt(devicesTable.firstSeenAt, oldestFirstSeen),
      ),
    );

  const [sessions, newDevices] = await Promise.all([getSessions, getNewDevices]);
  const { sessionToken } = await getParsedSessionCookie(ctx);
  const newDeviceHashes = new Set(newDevices.map(({ deviceIdHash }) => deviceIdHash));

  return sessions.map(({ secret, ...session }) => ({
    ...session,
    isCurrent: sessionToken === secret,
    isNewDevice: session.deviceIdHash !== null && newDeviceHashes.has(session.deviceIdHash),
  }));
};
