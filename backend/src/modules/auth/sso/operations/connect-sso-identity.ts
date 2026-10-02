import type { Context } from 'hono';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { insertIdentity, updateIdentity } from '#/modules/auth/oauth/identities-queries';
import type { SsoSignInFacts } from '#/modules/auth/sso/operations/provision-sso-user';
import { roleFromClaims } from '#/modules/auth/sso/role-from-claims';
import { spendCookieToken } from '#/modules/auth/tokens/token-lifecycle';
import { findMembershipsByUserIdsAndChannel } from '#/modules/memberships/memberships-queries';
import { insertMemberships } from '#/modules/memberships/operations/insert-memberships';
import { findOrganizationByTenant } from '#/modules/organization/organization-queries';
import type { UserWithCounters } from '#/modules/user/helpers/select';
import { addProvenEmail } from '#/modules/user/operations/email-proof';
import { findUserById } from '#/modules/user/user-queries';
import { getIsoDate } from '#/utils/iso-date';
import { log } from '#/utils/logger';

const dbCtx = { var: { db: baseDb } };

/**
 * Connects an institution account to the user the `oauth-connect` pin names, issued signed in right before leaving
 * for the federation. The identity is verified at once (the institution's assertion is the proof), the asserted address
 * joins the account under address authority, and the user becomes a member of the institution's organization, with the
 * role `roleFromClaims` gives, when they hold no membership there yet.
 * @throws AppError 401 `oauth-connect_not_found` without a live pin, 409 `oauth_conflict` when the institution account
 *   belongs to another user, and `addProvenEmail`'s 409 when another account holds the asserted address.
 */
export const connectSsoIdentity = async (
  ctx: Context<Env>,
  { federation, connection, claims, profile, snapshot, subject, identity }: SsoSignInFacts,
): Promise<UserWithCounters> => {
  // Spent only while the session that issued it lives: a connect abandoned before a sign-out cannot be finished.
  const pin = await spendCookieToken(ctx, 'oauth-connect');
  if (!pin?.userId || !pin.sessionId) throw new AppError(401, 'oauth-connect_not_found', 'warn');

  const user = await findUserById(dbCtx, { id: pin.userId });
  if (!user) throw new AppError(404, 'not_found', 'error', { entityType: 'user' });

  if (identity) {
    if (identity.userId !== user.id) throw new AppError(409, 'oauth_conflict', 'warn');
    await updateIdentity(dbCtx, {
      id: identity.id,
      values: { lastUsedAt: getIsoDate(), email: profile.email ?? identity.email, data: snapshot, connectionId: connection.id },
    });
    return user;
  }

  const organization = await findOrganizationByTenant(dbCtx, { tenantId: connection.tenantId });

  await baseDb.transaction(async (tx) => {
    const txCtx = { var: { db: tx } };
    await insertIdentity(txCtx, {
      values: {
        userId: user.id,
        kind: 'sso',
        issuer: federation.key,
        subject,
        email: profile.email ?? null,
        connectionId: connection.id,
        data: snapshot,
      },
      verified: true,
    });

    if (federation.addressAuthority && profile.email && profile.email !== user.email) {
      await addProvenEmail(txCtx, { userId: user.id, email: profile.email, via: federation.key });
    }

    if (organization) {
      const [existing] = await findMembershipsByUserIdsAndChannel(txCtx, { userIds: [user.id], channelId: organization.id });
      if (!existing) {
        const role = roleFromClaims({ federation: federation.key, connection, claims });
        await insertMemberships(txCtx, {
          items: [{ userId: user.id, role, entity: { ...organization, tenantId: connection.tenantId }, createdBy: user.id }],
        });
      }
    }
  });

  invalidateCache.user(user.id);
  log.info('SSO identity connected', { userId: user.id, strategy: federation.key, connectionId: connection.id });

  return user;
};
