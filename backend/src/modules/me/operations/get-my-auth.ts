import { appConfig, type EnabledOAuthProvider, isStrategyEnabled } from 'shared';
import type { UserContext } from '#/core/context';
import { findNewDevices } from '#/modules/auth/devices/devices-queries';
import { findSsoIdentities, findVerifiedOAuthIdentities } from '#/modules/auth/oauth/identities-queries';
import { findPasskeysByUser } from '#/modules/auth/passkeys/passkeys-queries';
import { sessionLifetime } from '#/modules/auth/sessions/operations/create-session';
import { findUserSessions } from '#/modules/auth/sessions/sessions-queries';
import { isFederationConfigured, isFederationKey } from '#/modules/auth/sso/helpers/federations';
import { findTotp } from '#/modules/auth/totps/totps-queries';
import { findActiveSsoConnectionsByTenants } from '#/modules/connections/connections-queries';
import { isoDateAgo } from '#/utils/iso-date';
import { TimeSpan } from '#/utils/time-span';

/** How long a browser counts as new in the sessions list: one session lifetime. */
const newDeviceWindow = sessionLifetime;

/** How long a revoked session stays in the list; the sweep drops a row that long after its expiry, so nothing lingers longer. */
const revokedSessionWindow = new TimeSpan(appConfig.retention.sessionDaysAfterExpiry, 'd');

const isEnabledProvider = (provider: string): provider is EnabledOAuthProvider =>
  appConfig.enabledOAuthProviders.includes(provider as EnabledOAuthProvider);

/**
 * The user's sessions, newest first and without their secret: the live and expired ones and those revoked within
 * {@link revokedSessionWindow}, each flagged with `isCurrent` and `isNewDevice`. A device is new when it was first seen
 * within {@link newDeviceWindow} and the user has an older device, so an account's first browser never counts.
 */
const readSessions = async (ctx: UserContext) => {
  const userId = ctx.var.user.id;
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

/**
 * The user's passkeys as a response carries them, the TOTP's dates, verified OAuth identities and SSO identities. TOTP
 * keeps the time step of its newest accepted code: the start of that step stands for its last use.
 */
const readSignInMethods = async (ctx: UserContext, userId: string) => {
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
 * How the signed-in user signs in, for the account page: passkeys, TOTP, the identities of enabled OAuth providers, the
 * institutions of the user's tenants with the identity held through each, and the sessions list.
 */
export async function getMyAuthOp(ctx: UserContext) {
  const sessions = await readSessions(ctx);
  const { oauth, ssoIdentities, ...methods } = await readSignInMethods(ctx, ctx.var.user.id);
  const oauthIdentities = oauth.flatMap(({ provider, ...identity }) => (isEnabledProvider(provider) ? [{ provider, ...identity }] : []));

  // The institutions of the tenants the user belongs to, each with the identity the account holds through it, if any.
  const tenantIds = [...new Set(ctx.var.memberships.map(({ tenantId }) => tenantId))];
  const identityAt = (connectionId: string) => {
    const identity = ssoIdentities.find((sso) => sso.connectionId === connectionId);
    return identity ? { email: identity.email, createdAt: identity.createdAt, lastUsedAt: identity.lastUsedAt } : null;
  };
  const connections = isStrategyEnabled('sso') ? await findActiveSsoConnectionsByTenants(ctx, { tenantIds }) : [];
  const institutions = connections.flatMap(({ id, displayName, issuer }) =>
    isFederationKey(issuer) && isFederationConfigured(issuer)
      ? [{ connectionId: id, displayName, federation: { key: issuer, label: appConfig.federations[issuer].label }, identity: identityAt(id) }]
      : [],
  );

  return { ...methods, oauthIdentities, institutions, sessions };
}
