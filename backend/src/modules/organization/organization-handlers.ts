import { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from '#/core/context';
import { createOrganizationsOp } from '#/modules/organization/operations/create-organizations';
import { deleteOrganizationsOp } from '#/modules/organization/operations/delete-organizations';
import { getOrganizationOp } from '#/modules/organization/operations/get-organization';
import { getOrganizationsOp } from '#/modules/organization/operations/get-organizations';
import { publishOrganizationOp } from '#/modules/organization/operations/publish-organization';
import { updateOrganizationOp } from '#/modules/organization/operations/update-organization';
import { organizationRoutes } from '#/modules/organization/organization-routes';
import { defaultHook } from '#/utils/default-hook';
import { readListPage } from '#/utils/list-page';

const app = new OpenAPIHono<Env>({ defaultHook });

app.openapi(organizationRoutes.batchCreateOrganizations, async (ctx) => {
  return ctx.json(await createOrganizationsOp(ctx, ctx.req.valid('json')), 201);
});

app.openapi(organizationRoutes.getOrganization, async (ctx) => {
  const { slug: bySlug, include } = ctx.req.valid('query');
  return ctx.json(await getOrganizationOp(ctx, ctx.req.valid('param').organizationId, { bySlug, include }), 200);
});

app.openapi(organizationRoutes.updateOrganization, async (ctx) => {
  return ctx.json(await updateOrganizationOp(ctx, ctx.req.valid('param').organizationId, ctx.req.valid('json')), 200);
});

app.openapi(organizationRoutes.publishOrganization, async (ctx) => {
  return ctx.json(await publishOrganizationOp(ctx, ctx.req.valid('param').organizationId), 200);
});

app.openapi(organizationRoutes.batchDeleteOrganizations, async (ctx) => {
  const { ids } = ctx.req.valid('json');
  return ctx.json(await deleteOrganizationsOp(ctx, ids), 200);
});

export const organizationHandlers = app;

const listApp = new OpenAPIHono<Env>({ defaultHook });

listApp.openapi(organizationRoutes.listOrganizations, async (ctx) => {
  const query = ctx.req.valid('query');
  return ctx.json(await readListPage(ctx, query, (page) => getOrganizationsOp(ctx, query, page)), 200);
});

/** The list across tenants, mounted at the `-` wildcard tenant. */
export const organizationListHandlers = listApp;
