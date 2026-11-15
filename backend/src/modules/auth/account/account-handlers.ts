import { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from '#/core/context';
import { authAccountRoutes } from '#/modules/auth/account/account-routes';
import { getMyAuthOp } from '#/modules/auth/account/operations/get-my-auth';
import { revokeMySessionsOp } from '#/modules/auth/account/operations/revoke-my-sessions';
import { toggleMfaOp } from '#/modules/auth/account/operations/toggle-mfa';
import { deleteAuthCookie } from '#/modules/auth/core/general/helpers/cookie';
import { defaultHook } from '#/utils/default-hook';

const app = new OpenAPIHono<Env>({ defaultHook });

app.openapi(authAccountRoutes.getMyAuth, async (ctx) => ctx.json(await getMyAuthOp(ctx), 200));

app.openapi(authAccountRoutes.toggleMfa, async (ctx) => ctx.json(await toggleMfaOp(ctx, ctx.req.valid('json').mfaRequired), 200));

app.openapi(authAccountRoutes.revokeMySessions, async (ctx) => {
  const { ids } = ctx.req.valid('json');
  const { results, rejectedIds, signedOut } = await revokeMySessionsOp(ctx, ids);
  if (signedOut) deleteAuthCookie(ctx, 'session');
  return ctx.json({ results, rejectedIds }, 200);
});

export const authAccountHandlers = app;
