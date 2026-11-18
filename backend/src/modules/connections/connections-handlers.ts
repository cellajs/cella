import { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from '#/core/context';
import { createLtiRegistrationLinkOp } from '#/modules/auth/flows/lti/operations/create-lti-registration-link';
import { connectionRoutes, organizationConnectionRoutes } from '#/modules/connections/connections-routes';
import { createConnectionOp } from '#/modules/connections/operations/create-connection';
import { deleteConnectionOp } from '#/modules/connections/operations/delete-connection';
import { deleteLtiConnectionOp } from '#/modules/connections/operations/delete-lti-connection';
import { getConnectionsOp } from '#/modules/connections/operations/get-connections';
import { getLtiConnectionsOp } from '#/modules/connections/operations/get-lti-connections';
import { updateConnectionOp } from '#/modules/connections/operations/update-connection';
import { readListPage, windowOf } from '#/utils/list-page';

const app = new OpenAPIHono<Env>();

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

const organizationApp = new OpenAPIHono<Env>();

organizationApp.openapi(organizationConnectionRoutes.listLtiConnections, async (ctx) => {
  const connections = await getLtiConnectionsOp(ctx);
  return ctx.json(await readListPage(ctx, ctx.req.valid('query'), async (page) => windowOf(connections, page)), 200);
});

organizationApp.openapi(organizationConnectionRoutes.createLtiRegistrationLink, async (ctx) => ctx.json(await createLtiRegistrationLinkOp(ctx), 200));

organizationApp.openapi(organizationConnectionRoutes.deleteLtiConnection, async (ctx) => {
  await deleteLtiConnectionOp(ctx, ctx.req.valid('param').connectionId);
  return ctx.body(null, 204);
});

export const organizationConnectionHandlers = organizationApp;
