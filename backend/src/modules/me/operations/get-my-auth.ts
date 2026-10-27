import type { z } from '@hono/zod-openapi';
import type { EnabledOAuthProvider } from 'shared';
import { appConfig, isStrategyEnabled } from 'shared';
import type { UserContext } from '#/core/context';
import { isFederationConfigured, isFederationKey } from '#/modules/auth/sso/helpers/federations';
import { findActiveSsoConnectionsByTenants } from '#/modules/connections/connections-queries';
import type { sessionSchema } from '#/modules/me/me-schema';
import { getAuthInfo } from '#/modules/me/operations/get-user-info';

interface GetMyAuthOpts {
  sessions: z.infer<typeof sessionSchema>[];
}

export async function getMyAuthOp(ctx: UserContext, { sessions }: GetMyAuthOpts) {
  const user = ctx.var.user;

  const authInfo = await getAuthInfo(ctx, { userId: user.id });

  const { oauth, ssoIdentities, ...restInfo } = authInfo;
  const isEnabledProvider = (provider: string): provider is EnabledOAuthProvider =>
    appConfig.enabledOAuthProviders.includes(provider as EnabledOAuthProvider);
  const oauthIdentities = oauth.flatMap(({ provider, ...identity }) => (isEnabledProvider(provider) ? [{ provider, ...identity }] : []));

  // The institutions of the tenants the user belongs to, each with the identity the account holds through it, if any.
  const tenantIds = [...new Set(ctx.var.memberships.map(({ tenantId }) => tenantId))];
  const identityAt = (connectionId: string) => {
    const identity = ssoIdentities.find((sso) => sso.connectionId === connectionId);
    return identity ? { email: identity.email, createdAt: identity.createdAt, lastUsedAt: identity.lastUsedAt } : null;
  };
  const connections = isStrategyEnabled('sso') ? await findActiveSsoConnectionsByTenants(ctx, { tenantIds }) : [];
  const institutions = connections
    .filter((connection) => isFederationKey(connection.issuer) && isFederationConfigured(connection.issuer))
    .map((connection) => ({
      connectionId: connection.id,
      displayName: connection.displayName,
      federation: { key: connection.issuer, label: appConfig.federations[connection.issuer as keyof typeof appConfig.federations].label },
      identity: identityAt(connection.id),
    }));

  return { ...restInfo, oauthIdentities, institutions, sessions };
}
