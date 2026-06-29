import { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from '#/core/context';
import { createDomainOp } from '#/modules/domains/operations/create-domain';
import { deleteDomainOp } from '#/modules/domains/operations/delete-domain';
import { getDomainOp } from '#/modules/domains/operations/get-domain';
import { getDomainsOp } from '#/modules/domains/operations/get-domains';
import { verifyDomainOp } from '#/modules/domains/operations/verify-domain';
import { defaultHook } from '#/utils/default-hook';
import domainRoutes from './domains-routes';

const app = new OpenAPIHono<Env>({ defaultHook });

app.openapi(domainRoutes.getDomains, async (ctx) => {
  const data = await getDomainsOp(ctx);
  return ctx.json(data);
});

app.openapi(domainRoutes.createDomain, async (ctx) => {
  const { domain } = ctx.req.valid('json');
  const data = await createDomainOp(ctx, domain);
  return ctx.json(data);
});

app.openapi(domainRoutes.deleteDomain, async (ctx) => {
  const { id } = ctx.req.valid('param');
  const data = await deleteDomainOp(ctx, id);
  return ctx.json(data);
});

app.openapi(domainRoutes.getDomain, async (ctx) => {
  const { id } = ctx.req.valid('param');
  const data = await getDomainOp(ctx, id);
  return ctx.json(data);
});

app.openapi(domainRoutes.verifyDomain, async (ctx) => {
  const { id } = ctx.req.valid('param');
  const data = await verifyDomainOp(ctx, id);
  return ctx.json(data);
});

export const domainHandlers = app;
