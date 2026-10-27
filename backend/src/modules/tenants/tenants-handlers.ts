import { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from '#/core/context';
import { getTenantsOp } from '#/modules/tenants/operations/get-tenants';
import { selfCreateTenantOp } from '#/modules/tenants/operations/self-create-tenant';
import { updateTenantOp } from '#/modules/tenants/operations/update-tenant';
import { tenantRoutes } from '#/modules/tenants/tenants-routes';
import { defaultHook } from '#/utils/default-hook';

const app = new OpenAPIHono<Env>({ defaultHook });

app.openapi(tenantRoutes.getTenants, async (ctx) => {
  const data = await getTenantsOp(ctx, ctx.req.valid('query'));
  return ctx.json(data, 200);
});

app.openapi(tenantRoutes.selfCreateTenant, async (ctx) => {
  const data = await selfCreateTenantOp(ctx, ctx.req.valid('json'));
  return ctx.json(data, 200);
});

app.openapi(tenantRoutes.updateTenant, async (ctx) => {
  const { tenantId } = ctx.req.valid('param');
  const data = await updateTenantOp(ctx, tenantId, ctx.req.valid('json'));
  return ctx.json(data, 200);
});

export const tenantHandlers = app;
