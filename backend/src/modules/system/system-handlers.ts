import { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from '#/core/context';
import { countLiveSystemInvitations } from '#/modules/auth/tokens/tokens-queries';
import { createInviteOp } from '#/modules/system/operations/create-invite';
import { deleteUsersOp } from '#/modules/system/operations/delete-users';
import { sendNewsletterOp } from '#/modules/system/operations/send-newsletter';
import { updateUserOp } from '#/modules/system/operations/update-user';
import { systemRoutes } from '#/modules/system/system-routes';
import '#/modules/system/system-listeners';
import { defaultHook } from '#/utils/default-hook';

const app = new OpenAPIHono<Env>({ defaultHook });

app.openapi(systemRoutes.inviteUsers, async (ctx) => {
  const { emails } = ctx.req.valid('json');
  return ctx.json(await createInviteOp(ctx, emails), 200);
});

app.openapi(systemRoutes.countSystemInvitations, async (ctx) => {
  const count = await countLiveSystemInvitations(ctx);
  return ctx.json({ count }, 200);
});

app.openapi(systemRoutes.batchDeleteUsers, async (ctx) => {
  const { ids } = ctx.req.valid('json');
  return ctx.json(await deleteUsersOp(ctx, ids), 200);
});

app.openapi(systemRoutes.updateUser, async (ctx) => {
  return ctx.json(await updateUserOp(ctx, ctx.req.valid('param').userId, ctx.req.valid('json')), 200);
});

app.openapi(systemRoutes.sendNewsletter, async (ctx) => {
  const { toSelf } = ctx.req.valid('query');
  const input = { ...ctx.req.valid('json'), toSelf };
  await sendNewsletterOp(ctx, input);
  return ctx.body(null, 204);
});

export const systemHandlers = app;
