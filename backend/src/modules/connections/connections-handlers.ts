import { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from '#/core/context';
import { connectionRoutes } from '#/modules/connections/connections-routes';
import { createConnectionOp } from '#/modules/connections/operations/create-connection';
import { deleteConnectionOp } from '#/modules/connections/operations/delete-connection';
import { getConnectionsOp } from '#/modules/connections/operations/get-connections';
import { updateConnectionOp } from '#/modules/connections/operations/update-connection';
import { defaultHook } from '#/utils/default-hook';
import { readListPage, windowOf } from '#/utils/list-page';

const app = new OpenAPIHono<Env>({ defaultHook });

app.openapi(connectionRoutes.listConnections, async (ctx) => {
  const connections = await getConnectionsOp(ctx);
  return ctx.json(await readListPage(ctx, ctx.req.valid('query'), async (page) => windowOf(connections, page)), 200);
});

app.openapi(connectionRoutes.createConnection, async (ctx) => ctx.json(await createConnectionOp(ctx, ctx.req.valid('json')), 201));

app.openapi(connectionRoutes.updateConnection, async (ctx) => {
  return ctx.json(await updateConnectionOp(ctx, ctx.req.valid('param').connectionId, ctx.req.valid('json')), 200);
});

app.openapi(connectionRoutes.deleteConnection, async (ctx) => {
  await deleteConnectionOp(ctx, ctx.req.valid('param').connectionId);
  return ctx.body(null, 204);
});

export const connectionHandlers = app;
