import { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from '#/core/context';
import { env } from '#/env';
import { defaultHook } from '#/utils/default-hook';
import { deletePushSubscription, upsertPushSubscription } from './push-queries';
import { pushRoutes } from './push-routes';

const app = new OpenAPIHono<Env>({ defaultHook });

app.openapi(pushRoutes.getPushVapid, async (ctx) => {
  return ctx.json({ publicKey: env.VAPID_PUBLIC_KEY ?? null }, 200);
});

app.openapi(pushRoutes.createPushSubscription, async (ctx) => {
  const body = ctx.req.valid('json');
  const row = await upsertPushSubscription({
    userId: ctx.var.user.id,
    endpoint: body.endpoint,
    p256dh: body.keys.p256dh,
    auth: body.keys.auth,
    expirationTime: body.expirationTime ? new Date(body.expirationTime).toISOString() : null,
    userAgent: ctx.req.header('user-agent')?.slice(0, 250) ?? null,
  });
  return ctx.json(row, 200);
});

app.openapi(pushRoutes.deletePushSubscription, async (ctx) => {
  const { endpoint } = ctx.req.valid('query');
  const deleted = await deletePushSubscription(ctx.var.user.id, endpoint);
  return ctx.json({ deleted }, 200);
});

export const pushHandlers = app;
