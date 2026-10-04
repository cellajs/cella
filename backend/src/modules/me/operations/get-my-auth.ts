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
  const db = ctx.var.db;

  const authInfo = await getAuthInfo({ var: { db } }, { userId: user.id });

  const { oauth, ssoConnectionIds, ...restInfo } = authInfo;
  const enabledOAuth = oauth
    .map(({ provider }) => provider)
    .filter((provider): provider is EnabledOAuthProvider => appConfig.enabledOAuthProviders.includes(provider as EnabledOAuthProvider));

  // The institutions of the tenants the user belongs to, flagged with whether the account is connected to each.
  const tenantIds = [...new Set(ctx.var.memberships.map(({ tenantId }) => tenantId))];
  const connections = isStrategyEnabled('sso') ? await findActiveSsoConnectionsByTenants({ var: { db } }, { tenantIds }) : [];
  const institutions = connections
    .filter((connection) => isFederationKey(connection.issuer) && isFederationConfigured(connection.issuer))
    .map((connection) => ({
      connectionId: connection.id,
      displayName: connection.displayName,
      federation: { key: connection.issuer, label: appConfig.federations[connection.issuer as keyof typeof appConfig.federations].label },
      connected: ssoConnectionIds.includes(connection.id),
    }));

  return { ...restInfo, enabledOAuth, institutions, sessions };
}
