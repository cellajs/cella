import { z } from '@hono/zod-openapi';
import { createXRoute } from '#/docs/x-routes';
import { isAuthenticated } from '#/middlewares/guard';
import {
  addDomainBodySchema,
  dnsInstructionsSchema,
  domainListQuerySchema,
  domainSchema,
  domainsListSchema,
  verificationResultSchema,
} from '#/modules/domains/domains-schema';
import { idSchema } from '#/utils/schema/common';
import { errorResponseRefs } from '#/utils/schema/error-responses';

const domainsRoutes = {
  /**
   * List all custom domains
   */
  listDomains: createXRoute({
    operationId: 'listDomains',
    method: 'get',
    path: '/',
    xGuard: isAuthenticated,
    tags: ['domains'],
    summary: 'List domains',
    description: 'Returns a paginated list of custom domains, optionally filtered by repository.',
    request: {
      query: domainListQuerySchema,
    },
    responses: {
      200: {
        description: 'List of domains',
        content: {
          'application/json': {
            schema: domainsListSchema,
          },
        },
      },
      ...errorResponseRefs,
    },
  }),

  /**
   * Get a specific domain by ID
   */
  getDomain: createXRoute({
    operationId: 'getDomain',
    method: 'get',
    path: '/{domainId}',
    xGuard: isAuthenticated,
    tags: ['domains'],
    summary: 'Get domain',
    description: 'Returns detailed information about a specific domain.',
    request: {
      params: z.object({
        domainId: idSchema,
      }),
    },
    responses: {
      200: {
        description: 'Domain details',
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
   * Add a custom domain to a repository
   */
  addDomain: createXRoute({
    operationId: 'addDomain',
    method: 'post',
    path: '/',
    xGuard: isAuthenticated,
    tags: ['domains'],
    summary: 'Add domain',
    description: 'Adds a custom domain to a repository and returns DNS verification instructions.',
    request: {
      body: {
        required: true,
        content: {
          'application/json': {
            schema: addDomainBodySchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Domain added with DNS instructions',
        content: {
          'application/json': {
            schema: dnsInstructionsSchema,
          },
        },
      },
      ...errorResponseRefs,
    },
  }),

  /**
   * Get DNS setup instructions for a domain
   */
  getDnsInstructions: createXRoute({
    operationId: 'getDnsInstructions',
    method: 'get',
    path: '/{domainId}/dns-instructions',
    xGuard: isAuthenticated,
    tags: ['domains'],
    summary: 'Get DNS instructions',
    description: 'Returns the DNS records that need to be configured for domain verification.',
    request: {
      params: z.object({
        domainId: idSchema,
      }),
    },
    responses: {
      200: {
        description: 'DNS setup instructions',
        content: {
          'application/json': {
            schema: dnsInstructionsSchema,
          },
        },
      },
      ...errorResponseRefs,
    },
  }),

  /**
   * Trigger verification check for a domain
   */
  verifyDomain: createXRoute({
    operationId: 'verifyDomain',
    method: 'post',
    path: '/{domainId}/verify',
    xGuard: isAuthenticated,
    tags: ['domains'],
    summary: 'Verify domain',
    description: 'Triggers a DNS verification check for the domain.',
    request: {
      params: z.object({
        domainId: idSchema,
      }),
    },
    responses: {
      200: {
        description: 'Verification result',
        content: {
          'application/json': {
            schema: verificationResultSchema,
          },
        },
      },
      ...errorResponseRefs,
    },
  }),

  /**
   * Remove a custom domain
   */
  removeDomain: createXRoute({
    operationId: 'removeDomain',
    method: 'delete',
    path: '/{domainId}',
    xGuard: isAuthenticated,
    tags: ['domains'],
    summary: 'Remove domain',
    description: 'Removes a custom domain from a repository.',
    request: {
      params: z.object({
        domainId: idSchema,
      }),
    },
    responses: {
      200: {
        description: 'Domain removed',
        content: {
          'application/json': {
            schema: z.object({ success: z.boolean() }),
          },
        },
      },
      ...errorResponseRefs,
    },
  }),
};

export default domainsRoutes;
