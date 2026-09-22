import { createXRoute } from '#/core/x-routes';
import { orgGuard, tenantGuard, userGuard } from '#/middlewares/guard';
import { singlePointsLimiter } from '#/middlewares/rate-limiter/limiters';
import {
  errorResponseRefs,
  idInTenantOrgParamSchema,
  paginationSchema,
  tenantOrgParamSchema,
  validIdSchema,
} from '#/schemas';
import {
  mockCreatedCredentialResponse,
  mockCredentialResponse,
  mockPaginatedServiceAccountsResponse,
  mockServiceAccountResponse,
} from './service-accounts-mocks';
import {
  createCredentialBodySchema,
  createdCredentialSchema,
  createServiceAccountBodySchema,
  createServiceAccountResponseSchema,
  credentialSchema,
  credentialsResponseSchema,
  serviceAccountListQuerySchema,
  serviceAccountSchema,
  updateServiceAccountBodySchema,
} from './service-accounts-schema';

const credentialParamSchema = idInTenantOrgParamSchema.extend({ credentialId: validIdSchema });
const tags = ['service-accounts', 'cella'];

/** All routes are user-only: creating and managing machine principals is a human act (D9). */
export const serviceAccountRoutes = {
  createServiceAccount: createXRoute({
    operationId: 'createServiceAccount',
    method: 'post',
    path: '/',
    xGuard: [userGuard, tenantGuard, orgGuard],
    xRateLimiter: [singlePointsLimiter],
    tags,
    summary: 'Create service account',
    description:
      'Creates a machine principal bound to this organization at the given role (capped at your own), optionally issuing its first API key in the same call.',
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
            example: { serviceAccount: mockServiceAccountResponse(), credential: mockCreatedCredentialResponse() },
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
    tags,
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
    tags,
    summary: 'Update service account',
    description: 'Renames, describes, disables or re-enables a service account. Accounts are never deleted.',
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
  getCredentials: createXRoute({
    operationId: 'getCredentials',
    method: 'get',
    path: '/{id}/credentials',
    xGuard: [userGuard, tenantGuard, orgGuard],
    tags,
    summary: 'Get API keys',
    description: 'Lists the API keys of a service account. Secrets are never returned here.',
    request: { params: idInTenantOrgParamSchema },
    responses: {
      200: {
        description: 'API keys',
        content: {
          'application/json': { schema: credentialsResponseSchema, example: { items: [mockCredentialResponse()] } },
        },
      },
      ...errorResponseRefs,
    },
  }),
  createCredential: createXRoute({
    operationId: 'createCredential',
    method: 'post',
    path: '/{id}/credentials',
    xGuard: [userGuard, tenantGuard, orgGuard],
    xRateLimiter: [singlePointsLimiter],
    tags,
    summary: 'Create API key',
    description:
      'Issues an API key for a service account; the plaintext is returned once. With `rollFrom`, the previous key keeps working for the overlap window.',
    request: {
      params: idInTenantOrgParamSchema,
      body: { required: true, content: { 'application/json': { schema: createCredentialBodySchema } } },
    },
    responses: {
      201: {
        description: 'API key was issued',
        content: { 'application/json': { schema: createdCredentialSchema, example: mockCreatedCredentialResponse() } },
      },
      ...errorResponseRefs,
    },
  }),
  revokeCredential: createXRoute({
    operationId: 'revokeCredential',
    method: 'delete',
    path: '/{id}/credentials/{credentialId}',
    xGuard: [userGuard, tenantGuard, orgGuard],
    xRateLimiter: [singlePointsLimiter],
    tags,
    summary: 'Revoke API key',
    description: 'Revokes an API key immediately. The row stays for the audit trail.',
    request: { params: credentialParamSchema },
    responses: {
      200: {
        description: 'API key was revoked',
        content: { 'application/json': { schema: credentialSchema, example: mockCredentialResponse() } },
      },
      ...errorResponseRefs,
    },
  }),
};

export type ServiceAccountRoutes = typeof serviceAccountRoutes;
