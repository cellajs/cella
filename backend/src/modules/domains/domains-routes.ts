import { appConfig } from 'shared';
import { createXRoutes, json, jsonBody, xRoute } from '#/core/x-routes';
import { sysAdminGuard, tenantGuard, userGuard } from '#/middlewares/guard';
import { singlePointsLimiter } from '#/middlewares/rate-limiter/limiters';
import { tenantOnlyParamSchema } from '#/schemas';
import { createDomainBodySchema, domainParamSchema, domainSchema, domainWithTokenSchema, verifyDomainResponseSchema } from './domains-schema';

export const domainRoutes = createXRoutes(['tenants', 'cella'], {
  getDomains: xRoute({
    method: 'get',
    path: '/',
    xGuard: [userGuard, sysAdminGuard, tenantGuard],
    summary: 'List domains for a tenant',
    description: 'Returns all domains belonging to a tenant, including verification tokens. System admin access required.',
    request: { params: tenantOnlyParamSchema },
    responses: { 200: json('List of domains', domainWithTokenSchema.array()) },
  }),

  createDomain: xRoute({
    method: 'post',
    path: '/',
    xGuard: [userGuard, sysAdminGuard, tenantGuard],
    xRateLimiter: [singlePointsLimiter],
    summary: 'Add a domain to a tenant',
    description: 'Adds a new domain to a tenant. The domain starts unverified. System admin access required.',
    request: { params: tenantOnlyParamSchema, body: jsonBody(createDomainBodySchema) },
    responses: { 200: json('Created domain', domainSchema) },
  }),

  deleteDomain: xRoute({
    method: 'delete',
    path: '/{id}',
    xGuard: [userGuard, sysAdminGuard, tenantGuard],
    xRateLimiter: [singlePointsLimiter],
    summary: 'Remove a domain',
    description: 'Removes a domain from a tenant. System admin access required.',
    request: { params: domainParamSchema },
    responses: { 200: json('Domain removed', domainSchema) },
  }),

  getDomain: xRoute({
    method: 'get',
    path: '/{id}',
    xGuard: [userGuard, sysAdminGuard, tenantGuard],
    summary: 'Get domain with verification token',
    description: 'Returns a single domain including its verification token for DNS TXT setup. System admin access required.',
    request: { params: domainParamSchema },
    responses: { 200: json('Domain with verification token', domainWithTokenSchema) },
  }),

  verifyDomain: xRoute({
    method: 'post',
    path: '/{id}/verify',
    xGuard: [userGuard, sysAdminGuard, tenantGuard],
    xRateLimiter: [singlePointsLimiter],
    summary: 'Verify domain ownership via DNS',
    description: `Looks up DNS TXT records for the domain to verify ownership. Checks for a _${appConfig.slug}-verification.<domain> TXT record matching the verification token.`,
    request: { params: domainParamSchema },
    responses: { 200: json('Verification result', verifyDomainResponseSchema) },
  }),
});
