import { createXRoute } from '#/core/x-routes';
import { orgGuard, stepUpGuard, tenantGuard, userGuard } from '#/middlewares/guard';
import { singlePointsLimiter } from '#/middlewares/rate-limiter/limiters';
import { errorResponseRefs, idInTenantOrgParamSchema, paginationSchema, tenantOrgParamSchema } from '#/schemas';
import {
  mockApiKeyResponse,
  mockCreatedApiKeyResponse,
  mockPaginatedServiceAccountsResponse,
  mockServiceAccountResponse,
} from './service-accounts-mocks';
import {
  apiKeyParamSchema,
  apiKeySchema,
  apiKeysResponseSchema,
  createApiKeyBodySchema,
  createdApiKeySchema,
  createServiceAccountBodySchema,
  createServiceAccountResponseSchema,
  serviceAccountListQuerySchema,
  serviceAccountSchema,
  updateServiceAccountBodySchema,
} from './service-accounts-schema';

/** All routes are user-only: creating and managing machine actors is a human act (D9). */
export const serviceAccountRoutes = {
  createServiceAccount: createXRoute({
    operationId: 'createServiceAccount',
    method: 'post',
    path: '/',
    xGuard: [userGuard, tenantGuard, orgGuard, stepUpGuard],
    xRateLimiter: [singlePointsLimiter],
    tags: ['service-accounts', 'cella'],
    summary: 'Create service account',
    description:
      'Creates a machine actor bound to this organization at the given role (capped at your own), optionally issuing its first API key in the same call.',
    request: {
      params: tenantOrgParamSchema,
      body: { required: true, content: { 'application/json': { schema: createServiceAccountBodySchema } } },
    },
    responses: {
      201: {
        description: 'Service account was created',
        content: {
          'application/json': {
            schema: createServiceAccountResponseSchema,
            example: { serviceAccount: mockServiceAccountResponse(), apiKey: mockCreatedApiKeyResponse() },
          },
        },
      },
      ...errorResponseRefs,
    },
  }),
  getServiceAccounts: createXRoute({
    operationId: 'getServiceAccounts',
    method: 'get',
    path: '/',
    xGuard: [userGuard, tenantGuard, orgGuard],
    tags: ['service-accounts', 'cella'],
    summary: 'Get service accounts',
    description: 'Lists the service accounts of this organization.',
    request: { params: tenantOrgParamSchema, query: serviceAccountListQuerySchema },
    responses: {
      200: {
        description: 'Service accounts',
        content: {
          'application/json': {
            schema: paginationSchema(serviceAccountSchema),
            example: mockPaginatedServiceAccountsResponse(),
          },
        },
      },
      ...errorResponseRefs,
    },
  }),
  updateServiceAccount: createXRoute({
    operationId: 'updateServiceAccount',
    method: 'put',
    path: '/{id}',
    xGuard: [userGuard, tenantGuard, orgGuard],
    xRateLimiter: [singlePointsLimiter],
    tags: ['service-accounts', 'cella'],
    summary: 'Update service account',
    description: 'Renames, disables or re-enables a service account. Accounts are never deleted.',
    request: {
      params: idInTenantOrgParamSchema,
      body: { required: true, content: { 'application/json': { schema: updateServiceAccountBodySchema } } },
    },
    responses: {
      200: {
        description: 'Service account was updated',
        content: { 'application/json': { schema: serviceAccountSchema, example: mockServiceAccountResponse() } },
      },
      ...errorResponseRefs,
    },
  }),
  getApiKeys: createXRoute({
    operationId: 'getApiKeys',
    method: 'get',
    path: '/{id}/keys',
    xGuard: [userGuard, tenantGuard, orgGuard],
    tags: ['service-accounts', 'cella'],
    summary: 'Get API keys',
    description: 'Lists the API keys of a service account. Secrets are never returned here.',
    request: { params: idInTenantOrgParamSchema },
    responses: {
      200: {
        description: 'API keys',
        content: {
          'application/json': { schema: apiKeysResponseSchema, example: { items: [mockApiKeyResponse()] } },
        },
      },
      ...errorResponseRefs,
    },
  }),
  createApiKey: createXRoute({
    operationId: 'createApiKey',
    method: 'post',
    path: '/{id}/keys',
    xGuard: [userGuard, tenantGuard, orgGuard, stepUpGuard],
    xRateLimiter: [singlePointsLimiter],
    tags: ['service-accounts', 'cella'],
    summary: 'Create API key',
    description:
      'Issues an API key for a service account; the plaintext is returned once. With `rollFrom`, the previous key keeps working for the overlap window.',
    request: {
      params: idInTenantOrgParamSchema,
      body: { required: true, content: { 'application/json': { schema: createApiKeyBodySchema } } },
    },
    responses: {
      201: {
        description: 'API key was issued',
        content: { 'application/json': { schema: createdApiKeySchema, example: mockCreatedApiKeyResponse() } },
      },
      ...errorResponseRefs,
    },
  }),
  revokeApiKey: createXRoute({
    operationId: 'revokeApiKey',
    method: 'delete',
    path: '/{id}/keys/{keyId}',
    xGuard: [userGuard, tenantGuard, orgGuard],
    xRateLimiter: [singlePointsLimiter],
    tags: ['service-accounts', 'cella'],
    summary: 'Revoke API key',
    description: 'Revokes an API key immediately. The row stays for the audit trail.',
    request: { params: apiKeyParamSchema },
    responses: {
      200: {
        description: 'API key was revoked',
        content: { 'application/json': { schema: apiKeySchema, example: mockApiKeyResponse() } },
      },
      ...errorResponseRefs,
    },
  }),
};
