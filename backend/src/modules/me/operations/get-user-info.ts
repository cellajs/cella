import type { z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import type { DbContext, Env } from '#/core/context';
import { findNewDevices } from '#/modules/auth/devices/devices-queries';
import { findVerifiedOAuthIdentities } from '#/modules/auth/oauth/identities-queries';
import { findPasskeysByUser } from '#/modules/auth/passkeys/passkeys-queries';
import { findUserSessions } from '#/modules/auth/sessions/sessions-queries';
import { findTotp } from '#/modules/auth/totps/totps-queries';
import type { sessionSchema } from '#/modules/me/me-schema';
import { TimeSpan } from '#/utils/time-span';

/** How long a browser counts as new in the sessions list: one session lifetime. */
const NEW_DEVICE_WINDOW = new TimeSpan(1, 'w');

/** How long a revoked session stays in the list; the sweep drops a row 30 days after its expiry, so nothing lingers longer. */
const REVOKED_SESSION_WINDOW = new TimeSpan(30, 'd');

/** Fetches passkeys (minus the sensitive credentialId/publicKey), whether TOTP is set, and verified OAuth providers. */
export const getAuthInfo = async (ctx: DbContext, { userId }: { userId: string }) => {
  const [passkeys, totp, oauth] = await Promise.all([
    findPasskeysByUser(ctx, { userId }),
    findTotp(ctx, { userId }),
    findVerifiedOAuthIdentities(ctx, { userId }),
  ]);
  return { passkeys, hasTotp: !!totp, oauth };
};

/**
 * Returns a user's sessions (newest first, secret stripped): the live and expired ones, and those revoked in the last
 * 30 days, each flagged with `isCurrent` and `isNewDevice`. A device is new when it was first seen within the window
 * and the user has an older device, so an account's first browser never counts.
 */
export const getUserSessions = async (ctx: Context<Env>, userId: string): Promise<z.infer<typeof sessionSchema>[]> => {
  // Compared in SQL: the columns are timestamps without zone, which JavaScript would parse as local time.
  const revokedSince = new Date(Date.now() - REVOKED_SESSION_WINDOW.milliseconds()).toISOString();
  const firstSeenAfter = new Date(Date.now() - NEW_DEVICE_WINDOW.milliseconds()).toISOString();

  const [sessions, newDevices] = await Promise.all([
    findUserSessions(ctx, { userId, revokedSince }),
    findNewDevices(ctx, { userId, firstSeenAfter }),
  ]);
  const newDeviceHashes = new Set(newDevices.map(({ deviceIdHash }) => deviceIdHash));

  return sessions.map((session) => ({
    ...session,
    isCurrent: session.id === ctx.var.sessionId,
    isNewDevice: session.deviceIdHash !== null && newDeviceHashes.has(session.deviceIdHash),
  }));
};
