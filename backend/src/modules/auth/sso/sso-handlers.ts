import { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from '#/core/context';
import { getSsoEntryOp } from '#/modules/auth/sso/operations/get-sso-entry';
import { handleSsoCallback } from '#/modules/auth/sso/operations/sso-callback';
import { sendSsoRecoveryLinkOp } from '#/modules/auth/sso/operations/sso-recovery';
import { startSso } from '#/modules/auth/sso/operations/start-sso';
import { authSsoRoutes } from '#/modules/auth/sso/sso-routes';
import { defaultHook } from '#/utils/default-hook';

const app = new OpenAPIHono<Env>({ defaultHook });

app.openapi(authSsoRoutes.getSsoEntry, async (ctx) => {
  const { connectionId } = ctx.req.valid('param');
  const data = await getSsoEntryOp(connectionId);
  return ctx.json(data);
});

app.openapi(authSsoRoutes.startSso, (ctx) => startSso(ctx, { connectionId: ctx.req.valid('param').connectionId }));

app.openapi(authSsoRoutes.startSsoFederation, (ctx) => startSso(ctx, { federation: ctx.req.valid('param').federation }));

app.openapi(authSsoRoutes.ssoCallback, (ctx) => handleSsoCallback(ctx));

app.openapi(authSsoRoutes.sendSsoRecoveryLink, async (ctx) => {
  const data = await sendSsoRecoveryLinkOp(ctx);
  return ctx.json(data, 200);
});

export const authSsoHandlers = app;
