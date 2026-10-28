import { createXRoutes, json, jsonBody, xRoute } from '#/core/x-routes';
import { orgGuard, stepUpFactorGuard, tenantGuard, userGuard } from '#/middlewares/guard';
import { singlePointsLimiter } from '#/middlewares/rate-limiter/limiters';
import {
  mockApiKeyResponse,
  mockCreatedApiKeyResponse,
  mockPaginatedServiceAccountsResponse,
  mockServiceAccountResponse,
} from '#/modules/service-accounts/service-accounts-mocks';
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
} from '#/modules/service-accounts/service-accounts-schema';
import { idInTenantOrgParamSchema, paginationSchema, tenantOrgParamSchema } from '#/schemas';

/**
 * All routes are user-only: creating and managing machine actors is a human act. Each operation first checks that the
 * caller may update the organization.
 */
const serviceAccountRoutes = createXRoutes(['service-accounts', 'cella'], {
  createServiceAccount: xRoute({
    method: 'post',
    path: '/',
    xGuard: [userGuard, tenantGuard, orgGuard, stepUpFactorGuard],
    xRateLimiter: [singlePointsLimiter],
    summary: 'Create service account',
    description:
      'Creates a machine actor bound to this organization at the given role (capped at your own), optionally issuing its first API key in the same call.',
    request: { params: tenantOrgParamSchema, body: jsonBody(createServiceAccountBodySchema) },
    responses: {
      201: json('Service account was created', createServiceAccountResponseSchema, {
        serviceAccount: mockServiceAccountResponse(),
        apiKey: mockCreatedApiKeyResponse(),
      }),
    },
  }),
  getServiceAccounts: xRoute({
    method: 'get',
    path: '/',
    xGuard: [userGuard, tenantGuard, orgGuard],
    summary: 'Get service accounts',
    description: 'Lists the service accounts of this organization.',
    request: { params: tenantOrgParamSchema, query: serviceAccountListQuerySchema },
    responses: { 200: json('Service accounts', paginationSchema(serviceAccountSchema), mockPaginatedServiceAccountsResponse()) },
  }),
  updateServiceAccount: xRoute({
    method: 'put',
    path: '/{id}',
    xGuard: [userGuard, tenantGuard, orgGuard],
    xRateLimiter: [singlePointsLimiter],
    summary: 'Update service account',
    description: 'Renames, disables or re-enables a service account. Accounts are never deleted.',
    request: { params: idInTenantOrgParamSchema, body: jsonBody(updateServiceAccountBodySchema) },
    responses: { 200: json('Service account was updated', serviceAccountSchema) },
  }),
  getApiKeys: xRoute({
    method: 'get',
    path: '/{id}/keys',
    xGuard: [userGuard, tenantGuard, orgGuard],
    summary: 'Get API keys',
    description: 'Lists the API keys of a service account. Secrets are never returned here.',
    request: { params: idInTenantOrgParamSchema },
    responses: { 200: json('API keys', apiKeysResponseSchema, { items: [mockApiKeyResponse()] }) },
  }),
  createApiKey: xRoute({
    method: 'post',
    path: '/{id}/keys',
    xGuard: [userGuard, tenantGuard, orgGuard, stepUpFactorGuard],
    xRateLimiter: [singlePointsLimiter],
    summary: 'Create API key',
    description:
      'Issues an API key for a service account; the plaintext is returned once. With `rollFrom`, the previous key keeps working for the overlap window.',
    request: { params: idInTenantOrgParamSchema, body: jsonBody(createApiKeyBodySchema) },
    responses: { 201: json('API key was issued', createdApiKeySchema, mockCreatedApiKeyResponse()) },
  }),
  revokeApiKey: xRoute({
    method: 'delete',
    path: '/{id}/keys/{keyId}',
    xGuard: [userGuard, tenantGuard, orgGuard],
    xRateLimiter: [singlePointsLimiter],
    summary: 'Revoke API key',
    description: 'Revokes an API key immediately. The row stays for the audit trail.',
    request: { params: apiKeyParamSchema },
    responses: { 200: json('API key was revoked', apiKeySchema) },
  }),
});

export { serviceAccountRoutes };
