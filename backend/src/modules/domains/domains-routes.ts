import { createXRoute } from '#/docs/x-routes';
import { authGuard, sysAdminGuard } from '#/middlewares/guard';
import { singlePointsLimiter } from '#/middlewares/rate-limiter/limiters';
import { errorResponseRefs, tenantOnlyParamSchema } from '#/schemas';
import {
  createDomainBodySchema,
  domainParamSchema,
  domainSchema,
  domainWithTokenSchema,
  verifyDomainResponseSchema,
} from './domains-schema';

export const domainRoutes = {
  /**
   * List domains for a tenant (system admin only)
   */
  getDomains: createXRoute({
    operationId: 'getDomains',
    method: 'get',
    path: '/',
    xGuard: [authGuard, sysAdminGuard],
    tags: ['tenants'],
    summary: 'List domains for a tenant',
    description:
      'Returns all domains belonging to a tenant, including verification tokens. System admin access required.',
    request: { params: tenantOnlyParamSchema },
    responses: {
      200: {
        description: 'List of domains',
        content: {
          'application/json': {
            schema: domainWithTokenSchema.array(),
          },
        },
      },
      ...errorResponseRefs,
    },
  }),

  /**
   * Add a domain to a tenant (system admin only)
   */
  createDomain: createXRoute({
    operationId: 'createDomain',
    method: 'post',
    path: '/',
    xGuard: [authGuard, sysAdminGuard],
    xRateLimiter: singlePointsLimiter,
    tags: ['tenants'],
    summary: 'Add a domain to a tenant',
    description: 'Adds a new domain to a tenant. The domain starts unverified. System admin access required.',
    request: {
      params: tenantOnlyParamSchema,
      body: {
        required: true,
        content: { 'application/json': { schema: createDomainBodySchema } },
      },
    },
    responses: {
      200: {
        description: 'Created domain',
        content: {
          'application/json': {
            schema: domainSchema,
          },
        },
      },
      ...errorResponseRefs,
    },
  }),

  /**
   * Remove a domain from a tenant (system admin only)
   */
  deleteDomain: createXRoute({
    operationId: 'deleteDomain',
    method: 'delete',
    path: '/{id}',
    xGuard: [authGuard, sysAdminGuard],
    xRateLimiter: singlePointsLimiter,
    tags: ['tenants'],
    summary: 'Remove a domain',
    description: 'Removes a domain from a tenant. System admin access required.',
    request: { params: domainParamSchema },
    responses: {
      200: {
        description: 'Domain removed',
        content: {
          'application/json': {
            schema: domainSchema,
          },
        },
      },
      ...errorResponseRefs,
    },
  }),

  /**
   * Get a single domain with its verification token (system admin only)
   */
  getDomain: createXRoute({
    operationId: 'getDomain',
    method: 'get',
    path: '/{id}',
    xGuard: [authGuard, sysAdminGuard],
    tags: ['tenants'],
    summary: 'Get domain with verification token',
    description:
      'Returns a single domain including its verification token for DNS TXT setup. System admin access required.',
    request: { params: domainParamSchema },
    responses: {
      200: {
        description: 'Domain with verification token',
        content: {
          'application/json': {
            schema: domainWithTokenSchema,
          },
        },
      },
      ...errorResponseRefs,
    },
  }),

  /**
   * Verify a domain via DNS TXT record lookup (system admin only)
   */
  verifyDomain: createXRoute({
    operationId: 'verifyDomain',
    method: 'post',
    path: '/{id}/verify',
    xGuard: [authGuard, sysAdminGuard],
    xRateLimiter: singlePointsLimiter,
    tags: ['tenants'],
    summary: 'Verify domain ownership via DNS',
    description:
      'Looks up DNS TXT records for the domain to verify ownership. Checks for a _cella-verification.<domain> TXT record matching the verification token.',
    request: { params: domainParamSchema },
    responses: {
      200: {
        description: 'Verification result',
        content: {
          'application/json': {
            schema: verifyDomainResponseSchema,
          },
        },
      },
      ...errorResponseRefs,
    },
  }),
};

export default domainRoutes;
