import { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from '#/core/context';
import { createInviteOp } from '#/modules/system/operations/create-invite';
import { deleteUsersOp } from '#/modules/system/operations/delete-users';
import { sendNewsletterOp } from '#/modules/system/operations/send-newsletter';
import { updateUserOp } from '#/modules/system/operations/update-user';
import { systemRoutes } from '#/modules/system/system-routes';
import '#/modules/system/system-module';
import '#/modules/system/system-listeners';
import { defaultHook } from '#/utils/default-hook';

const app = new OpenAPIHono<Env>({ defaultHook });

app.openapi(systemRoutes.createInvite, async (ctx) => {
  const { emails } = ctx.req.valid('json');
  const data = await createInviteOp(ctx, emails);
  return ctx.json(data, 200);
});

app.openapi(systemRoutes.deleteUsers, async (ctx) => {
  const { ids } = ctx.req.valid('json');
  const data = await deleteUsersOp(ctx, Array.isArray(ids) ? ids : [ids]);
  return ctx.json(data, 200);
});

app.openapi(systemRoutes.updateUser, async (ctx) => {
  const { id } = ctx.req.valid('param');
  const data = await updateUserOp(ctx, id, ctx.req.valid('json'));
  return ctx.json(data, 200);
});

app.openapi(systemRoutes.sendNewsletter, async (ctx) => {
  const { toSelf } = ctx.req.valid('query');
  const input = { ...ctx.req.valid('json'), toSelf };
  await sendNewsletterOp(ctx, input);
  return ctx.body(null, 204);
});

export const systemHandlers = app;
