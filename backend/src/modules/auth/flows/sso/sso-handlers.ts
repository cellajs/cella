import { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from '#/core/context';
import { getSsoEntryOp } from '#/modules/auth/flows/sso/operations/get-sso-entry';
import { handleSsoCallback } from '#/modules/auth/flows/sso/operations/sso-callback';
import { sendSsoRecoveryLinkOp } from '#/modules/auth/flows/sso/operations/sso-recovery';
import { startSso } from '#/modules/auth/flows/sso/operations/start-sso';
import { authSsoRoutes } from '#/modules/auth/flows/sso/sso-routes';

const app = new OpenAPIHono<Env>();

app.openapi(authSsoRoutes.getSsoEntry, async (ctx) => ctx.json(await getSsoEntryOp(ctx.req.valid('param').connectionId), 200));

app.openapi(authSsoRoutes.startSso, (ctx) => startSso(ctx, { connectionId: ctx.req.valid('param').connectionId }));

app.openapi(authSsoRoutes.startSsoFederation, (ctx) => startSso(ctx, { federation: ctx.req.valid('param').federation }));

app.openapi(authSsoRoutes.ssoCallback, (ctx) => handleSsoCallback(ctx));

app.openapi(authSsoRoutes.sendSsoRecoveryLink, async (ctx) => ctx.json(await sendSsoRecoveryLinkOp(ctx), 200));

export const authSsoHandlers = app;
