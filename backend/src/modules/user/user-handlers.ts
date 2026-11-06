import { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from '#/core/context';
import { getUserOp } from '#/modules/user/operations/get-user';
import { getUsersOp } from '#/modules/user/operations/get-users';
import { userRoutes } from '#/modules/user/user-routes';
import { defaultHook } from '#/utils/default-hook';
import { readListPage } from '#/utils/list-page';

const app = new OpenAPIHono<Env>({ defaultHook });

app.openapi(userRoutes.listUsers, async (ctx) => {
  const query = ctx.req.valid('query');
  return ctx.json(await readListPage(ctx, query, (page) => getUsersOp(ctx, query, page)), 200);
});

app.openapi(userRoutes.getUser, async (ctx) => {
  const { userId } = ctx.req.valid('param');
  const { slug: bySlug, include } = ctx.req.valid('query');
  const data = await getUserOp(ctx, userId, { bySlug, include });
  return ctx.json(data, 200);
});

export const userHandlers = app;
