import type { z } from '@hono/zod-openapi';
import type { EnabledOAuthProvider } from 'shared';
import { appConfig } from 'shared';
import type { AuthContext } from '#/core/context';
import { getAuthInfo } from '#/modules/me/helpers/get-user-info';
import type { sessionSchema } from '#/modules/me/me-schema';

interface GetMyAuthOpts {
  sessions: z.infer<typeof sessionSchema>[];
}

export async function getMyAuthOp(ctx: AuthContext, { sessions }: GetMyAuthOpts) {
  const user = ctx.var.user;
  const db = ctx.var.db;

  const authInfo = await getAuthInfo({ var: { db } }, { userId: user.id });

  const { oauth, ...restInfo } = authInfo;
  const enabledOAuth = oauth
    .map(({ provider }) => provider)
    .filter((provider): provider is EnabledOAuthProvider =>
      appConfig.enabledOAuthProviders.includes(provider as EnabledOAuthProvider),
    );

  return { ...restInfo, enabledOAuth, sessions };
}
