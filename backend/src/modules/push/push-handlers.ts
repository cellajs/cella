import { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { maxLength } from '#/db/utils/constraints';
import { deletePushSubscription, upsertPushSubscription } from '#/modules/push/push-queries';
import { pushRoutes } from '#/modules/push/push-routes';
import { getVapidPublicKey } from '#/modules/push/push-sender';
import { defaultHook } from '#/utils/default-hook';

const app = new OpenAPIHono<Env>({ defaultHook });

app.openapi(pushRoutes.getPushVapid, async (ctx) => ctx.json({ publicKey: getVapidPublicKey() }, 200));

app.openapi(pushRoutes.createPushSubscription, async (ctx) => {
  const body = ctx.req.valid('json');
  const row = await upsertPushSubscription(ctx, {
    values: {
      userId: ctx.var.user.id,
      endpoint: body.endpoint,
      ...body.keys,
      userAgent: ctx.req.header('user-agent')?.slice(0, maxLength.field) ?? null,
    },
  });
  if (!row) throw new AppError(403, 'forbidden', 'warn');
  return ctx.json(row, 201);
});

app.openapi(pushRoutes.removePushSubscription, async (ctx) => {
  const { endpoint } = ctx.req.valid('json');
  const deleted = await deletePushSubscription(ctx, { userId: ctx.var.user.id, endpoint });
  return ctx.json({ deleted }, 200);
});

export const pushHandlers = app;
