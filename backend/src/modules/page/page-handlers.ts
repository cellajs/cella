import { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from '#/core/context';
import '#/modules/page/page-module';
import { assertSuccess } from '#/core/operation-result';
import { createPagesOp } from '#/modules/page/operations/create-pages';
import { deletePagesOp } from '#/modules/page/operations/delete-pages';
import { getPageOp } from '#/modules/page/operations/get-page';
import { getPagesOp } from '#/modules/page/operations/get-pages';
import { updatePageOp } from '#/modules/page/operations/update-page';
import pagesRoutes from '#/modules/page/page-routes';
import { defaultHook } from '#/utils/default-hook';

const app = new OpenAPIHono<Env>({ defaultHook });

app.openapi(pagesRoutes.getPages, async (ctx) => {
  const { items, total } = await getPagesOp(ctx.req.valid('query'));
  return ctx.json({ items, total }, 200);
});

app.openapi(pagesRoutes.getPage, async (ctx) => {
  const { id } = ctx.req.valid('param');
  const pageResponse = await getPageOp(ctx, id);
  ctx.set('entityCacheData', pageResponse);
  return ctx.json(pageResponse, 200);
});

app.openapi(pagesRoutes.createPages, async (ctx) => {
  const result = await createPagesOp(ctx, ctx.req.valid('json'));
  assertSuccess(result, 'page');
  return ctx.json(result.data, 201);
});

app.openapi(pagesRoutes.updatePage, async (ctx) => {
  const { id } = ctx.req.valid('param');
  const { fullResponse } = ctx.req.valid('query');
  const result = await updatePageOp(ctx, id, ctx.req.valid('json'), { fullResponse });
  assertSuccess(result, 'page');
  return ctx.json(result.data, 200);
});

app.openapi(pagesRoutes.deletePages, async (ctx) => {
  const { ids } = ctx.req.valid('json');
  await deletePagesOp(ctx, ids);
  return ctx.json({ data: [], rejectedIds: [] }, 200);
});

export const pageHandlers = app;
