import { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from '#/core/context';
import { connectionRoutes } from '#/modules/connections/connections-routes';
import { createConnectionOp } from '#/modules/connections/operations/create-connection';
import { deleteConnectionOp } from '#/modules/connections/operations/delete-connection';
import { getConnectionsOp } from '#/modules/connections/operations/get-connections';
import { updateConnectionOp } from '#/modules/connections/operations/update-connection';
import { defaultHook } from '#/utils/default-hook';

const app = new OpenAPIHono<Env>({ defaultHook });

app.openapi(connectionRoutes.listConnections, async (ctx) => {
  const data = await getConnectionsOp(ctx);
  return ctx.json(data, 200);
});

app.openapi(connectionRoutes.createConnection, async (ctx) => {
  const data = await createConnectionOp(ctx, ctx.req.valid('json'));
  return ctx.json(data, 201);
});

app.openapi(connectionRoutes.updateConnection, async (ctx) => {
  const { connectionId } = ctx.req.valid('param');
  const data = await updateConnectionOp(ctx, connectionId, ctx.req.valid('json'));
  return ctx.json(data, 200);
});

app.openapi(connectionRoutes.deleteConnection, async (ctx) => {
  const { connectionId } = ctx.req.valid('param');
  await deleteConnectionOp(ctx, connectionId);
  return ctx.body(null, 204);
});

export const connectionHandlers = app;
