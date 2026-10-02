import { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from '#/core/context';
import { createConnectionOp } from '#/modules/connections/operations/create-connection';
import { deleteConnectionOp } from '#/modules/connections/operations/delete-connection';
import { getConnectionsOp } from '#/modules/connections/operations/get-connections';
import { updateConnectionOp } from '#/modules/connections/operations/update-connection';
import { defaultHook } from '#/utils/default-hook';
import { connectionRoutes } from './connections-routes';

const app = new OpenAPIHono<Env>({ defaultHook });

app.openapi(connectionRoutes.getConnections, async (ctx) => {
  const data = await getConnectionsOp(ctx);
  return ctx.json(data);
});

app.openapi(connectionRoutes.createConnection, async (ctx) => {
  const data = await createConnectionOp(ctx, ctx.req.valid('json'));
  return ctx.json(data);
});

app.openapi(connectionRoutes.updateConnection, async (ctx) => {
  const { id } = ctx.req.valid('param');
  const data = await updateConnectionOp(ctx, id, ctx.req.valid('json'));
  return ctx.json(data);
});

app.openapi(connectionRoutes.deleteConnection, async (ctx) => {
  const { id } = ctx.req.valid('param');
  const data = await deleteConnectionOp(ctx, id);
  return ctx.json(data);
});

export const connectionHandlers = app;
