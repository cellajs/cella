import type { z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { appConfig } from 'shared';
import type { DbContext, Env } from '#/core/context';
import { findNewDevices } from '#/modules/auth/devices/devices-queries';
import { findSsoIdentities, findVerifiedOAuthIdentities } from '#/modules/auth/oauth/identities-queries';
import { findPasskeysByUser } from '#/modules/auth/passkeys/passkeys-queries';
import { sessionLifetime } from '#/modules/auth/sessions/operations/create-session';
import { findUserSessions } from '#/modules/auth/sessions/sessions-queries';
import { findTotp } from '#/modules/auth/totps/totps-queries';
import type { sessionSchema } from '#/modules/me/me-schema';
import { isoDateAgo } from '#/utils/iso-date';
import { TimeSpan } from '#/utils/time-span';

/** How long a browser counts as new in the sessions list: one session lifetime. */
const newDeviceWindow = sessionLifetime;

/** How long a revoked session stays in the list; the sweep drops a row that long after its expiry, so nothing lingers longer. */
const revokedSessionWindow = new TimeSpan(appConfig.retention.sessionDaysAfterExpiry, 'd');

/**
 * Fetches passkeys (minus the sensitive credentialId/publicKey), the TOTP's dates, verified OAuth identities and the SSO
 * identities. TOTP keeps the time step of its newest accepted code: the start of that step stands for its last use.
 */
export const getAuthInfo = async (ctx: DbContext, { userId }: { userId: string }) => {
  const [passkeys, totpRow, oauth, ssoIdentities] = await Promise.all([
    findPasskeysByUser(ctx, { userId }),
    findTotp(ctx, { userId }),
    findVerifiedOAuthIdentities(ctx, { userId }),
    findSsoIdentities(ctx, { userId }),
  ]);
  const stepMs = appConfig.totp.intervalInSeconds * 1000;
  const totp = totpRow
    ? { createdAt: totpRow.createdAt, lastUsedAt: totpRow.lastUsedStep === null ? null : new Date(totpRow.lastUsedStep * stepMs).toISOString() }
    : null;
  return { passkeys, totp, oauth, ssoIdentities };
};

/**
 * Returns a user's sessions (newest first, secret stripped): the live and expired ones, and those revoked in the last
 * 30 days, each flagged with `isCurrent` and `isNewDevice`. A device is new when it was first seen within the window
 * and the user has an older device, so an account's first browser never counts.
 */
export const getUserSessions = async (ctx: Context<Env>, userId: string): Promise<z.infer<typeof sessionSchema>[]> => {
  const revokedSince = isoDateAgo(revokedSessionWindow);
  const firstSeenAfter = isoDateAgo(newDeviceWindow);

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
