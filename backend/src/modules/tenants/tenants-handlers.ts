import { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from '#/core/context';
import { createDemoOp } from '#/modules/tenants/operations/create-demo';
import { getTenantsOp } from '#/modules/tenants/operations/get-tenants';
import { selfCreateTenantOp } from '#/modules/tenants/operations/self-create-tenant';
import { updateTenantOp } from '#/modules/tenants/operations/update-tenant';
import { demoRoutes, tenantRoutes } from '#/modules/tenants/tenants-routes';
import { defaultHook } from '#/utils/default-hook';
import { readListPage } from '#/utils/list-page';

const app = new OpenAPIHono<Env>({ defaultHook });

app.openapi(tenantRoutes.listTenants, async (ctx) => {
  const query = ctx.req.valid('query');
  return ctx.json(await readListPage(ctx, query, (page) => getTenantsOp(ctx, query, page)), 200);
});

app.openapi(tenantRoutes.createTenant, async (ctx) => {
  return ctx.json(await selfCreateTenantOp(ctx, ctx.req.valid('json')), 201);
});

app.openapi(tenantRoutes.updateTenant, async (ctx) => {
  return ctx.json(await updateTenantOp(ctx, ctx.req.valid('param').tenantId, ctx.req.valid('json')), 200);
});

export const tenantHandlers = app;

const demoApp = new OpenAPIHono<Env>({ defaultHook });

demoApp.openapi(demoRoutes.createDemo, async (ctx) => {
  const { tenant, created } = await createDemoOp(ctx);
  return created ? ctx.json(tenant, 201) : ctx.json(tenant, 200);
});

export const demoHandlers = demoApp;
