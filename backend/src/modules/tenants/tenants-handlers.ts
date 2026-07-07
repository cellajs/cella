import { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from '#/core/context';
import '#/modules/tenants/tenants-module';
import { createTenantOp } from '#/modules/tenants/operations/create-tenant';
import { getTenantsOp } from '#/modules/tenants/operations/get-tenants';
import { selfCreateTenantOp } from '#/modules/tenants/operations/self-create-tenant';
import { updateTenantOp } from '#/modules/tenants/operations/update-tenant';
import { defaultHook } from '#/utils/default-hook';
import { tenantRoutes } from './tenants-routes';

const app = new OpenAPIHono<Env>({ defaultHook });

app.openapi(tenantRoutes.getTenants, async (ctx) => {
  const data = await getTenantsOp(ctx, ctx.req.valid('query'));
  return ctx.json(data);
});

app.openapi(tenantRoutes.createTenant, async (ctx) => {
  const data = await createTenantOp(ctx, ctx.req.valid('json'));
  return ctx.json(data);
});

app.openapi(tenantRoutes.selfCreateTenant, async (ctx) => {
  const data = await selfCreateTenantOp(ctx, ctx.req.valid('json'));
  return ctx.json(data);
});

app.openapi(tenantRoutes.updateTenant, async (ctx) => {
  const { tenantId } = ctx.req.valid('param');
  const data = await updateTenantOp(ctx, tenantId, ctx.req.valid('json'));
  return ctx.json(data);
});

export const tenantHandlers = app;
