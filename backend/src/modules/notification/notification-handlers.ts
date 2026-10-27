import { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from '#/core/context';
import '#/modules/notification/notification-listeners';
import { notificationRoutes } from '#/modules/notification/notification-routes';
import { getNotificationsOp } from '#/modules/notification/operations/get-notifications';
import { markReadOp } from '#/modules/notification/operations/mark-read';
import { getPreferencesOp, updatePreferencesOp } from '#/modules/notification/operations/preferences';
import { unsubscribeNotificationsOp } from '#/modules/notification/operations/unsubscribe';
import { defaultHook } from '#/utils/default-hook';

const app = new OpenAPIHono<Env>({ defaultHook });

app.openapi(notificationRoutes.getNotifications, async (ctx) => {
  const { unread, limit, before } = ctx.req.valid('query');
  const data = await getNotificationsOp(ctx, { unreadOnly: unread, limit, before });
  return ctx.json(data, 200);
});

app.openapi(notificationRoutes.markNotificationsRead, async (ctx) => {
  const body = ctx.req.valid('json');
  const data = await markReadOp(ctx, body);
  return ctx.json(data, 200);
});

app.openapi(notificationRoutes.getNotificationPreferences, async (ctx) => {
  const data = await getPreferencesOp(ctx);
  return ctx.json(data, 200);
});

app.openapi(notificationRoutes.updateNotificationPreferences, async (ctx) => {
  const body = ctx.req.valid('json');
  const data = await updatePreferencesOp(ctx, body);
  return ctx.json(data, 200);
});

app.openapi(notificationRoutes.unsubscribeNotifications, async (ctx) => {
  const { user, category, token } = ctx.req.valid('query');
  const redirectUrl = await unsubscribeNotificationsOp(ctx, { userId: user, category, token });
  return ctx.redirect(redirectUrl, 302);
});

export const notificationHandlers = app;
