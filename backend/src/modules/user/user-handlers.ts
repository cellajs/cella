import { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from '#/core/context';
import { getUserOp } from '#/modules/user/operations/get-user';
import { getUsersOp } from '#/modules/user/operations/get-users';
import userRoutes from '#/modules/user/user-routes';
import '#/modules/user/user-module';
import { defaultHook } from '#/utils/default-hook';

const app = new OpenAPIHono<Env>({ defaultHook });

app.openapi(userRoutes.getUsers, async (ctx) => {
  const data = await getUsersOp(ctx, ctx.req.valid('query'));
  return ctx.json(data, 200);
});

app.openapi(userRoutes.getUser, async (ctx) => {
  const { relatableUserId } = ctx.req.valid('param');
  const { slug: bySlug } = ctx.req.valid('query');
  const data = await getUserOp(ctx, relatableUserId, { bySlug });
  return ctx.json(data, 200);
});

export const userHandlers = app;
