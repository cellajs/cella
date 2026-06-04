import { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from '#/core/context';
import '#/modules/organization/organization-module';
import { createOrganizationsOp } from '#/modules/organization/operations/create-organizations';
import { deleteOrganizationsOp } from '#/modules/organization/operations/delete-organizations';
import { getOrganizationOp } from '#/modules/organization/operations/get-organization';
import { getOrganizationsOp } from '#/modules/organization/operations/get-organizations';
import { updateOrganizationOp } from '#/modules/organization/operations/update-organization';
import organizationRoutes from '#/modules/organization/organization-routes';
import { defaultHook } from '#/utils/default-hook';

const app = new OpenAPIHono<Env>({ defaultHook });

app.openapi(organizationRoutes.createOrganizations, async (ctx) => {
  const { tenantId } = ctx.req.valid('param');
  const data = await createOrganizationsOp(ctx, ctx.req.valid('json'), tenantId);
  return ctx.json(data, 201);
});

app.openapi(organizationRoutes.getOrganizations, async (ctx) => {
  const data = await getOrganizationsOp(ctx, ctx.req.valid('query'));
  return ctx.json(data, 200);
});

app.openapi(organizationRoutes.getOrganization, async (ctx) => {
  const { tenantId, id } = ctx.req.valid('param');
  const { slug: bySlug, include } = ctx.req.valid('query');
  const data = await getOrganizationOp(ctx, id, tenantId, { bySlug, include });
  return ctx.json(data, 200);
});

app.openapi(organizationRoutes.updateOrganization, async (ctx) => {
  const { tenantId, id } = ctx.req.valid('param');
  const data = await updateOrganizationOp(ctx, id, tenantId, ctx.req.valid('json'));
  return ctx.json(data, 200);
});

app.openapi(organizationRoutes.deleteOrganizations, async (ctx) => {
  const { ids } = ctx.req.valid('json');
  const { tenantId } = ctx.req.valid('param');
  const data = await deleteOrganizationsOp(ctx, Array.isArray(ids) ? ids : [ids], tenantId);
  return ctx.json(data, 200);
});

export const organizationHandlers = app;
