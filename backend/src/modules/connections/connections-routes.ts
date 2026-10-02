import { z } from '@hono/zod-openapi';
import { createXRoutes, json, jsonBody, xRoute } from '#/core/x-routes';
import { sysAdminGuard, tenantGuard, userGuard } from '#/middlewares/guard';
import { singlePointsLimiter } from '#/middlewares/rate-limiter/limiters';
import { tenantOnlyParamSchema } from '#/schemas';
import { mockConnectionResponse } from './connections-mocks';
import { connectionParamSchema, connectionSchema, createConnectionBodySchema, updateConnectionBodySchema } from './connections-schema';

export const connectionRoutes = createXRoutes(['connections', 'cella'], {
  getConnections: xRoute({
    method: 'get',
    path: '/',
    xEnabledBy: { strategy: 'sso' },
    xGuard: [userGuard, sysAdminGuard, tenantGuard],
    summary: 'Get connections',
    description:
      "The tenant's connections: the institutions whose members sign in to its organization through an SSO federation. System admin access required.",
    request: { params: tenantOnlyParamSchema },
    responses: { 200: json('Connections', z.array(connectionSchema), [mockConnectionResponse()]) },
  }),
  createConnection: xRoute({
    method: 'post',
    path: '/',
    xEnabledBy: { strategy: 'sso' },
    xGuard: [userGuard, sysAdminGuard, tenantGuard],
    xRateLimiter: [singlePointsLimiter],
    summary: 'Create connection',
    description:
      'Connects an institution to the tenant: the federation it signs in through, its domains and its IdP entity ids. Starts `pending` until the institution activated the service at the federation; one SSO connection per tenant, and a domain belongs to one connection.',
    request: { params: tenantOnlyParamSchema, body: jsonBody(createConnectionBodySchema) },
    responses: { 200: json('Created connection', connectionSchema, mockConnectionResponse()) },
  }),
  updateConnection: xRoute({
    method: 'put',
    path: '/{id}',
    xEnabledBy: { strategy: 'sso' },
    xGuard: [userGuard, sysAdminGuard, tenantGuard],
    xRateLimiter: [singlePointsLimiter],
    summary: 'Update connection',
    description: 'Changes the name, domains, IdP entity ids, status or provisioning of a connection; the federation stays what it was.',
    request: { params: connectionParamSchema, body: jsonBody(updateConnectionBodySchema) },
    responses: { 200: json('Updated connection', connectionSchema, mockConnectionResponse()) },
  }),
  deleteConnection: xRoute({
    method: 'delete',
    path: '/{id}',
    xEnabledBy: { strategy: 'sso' },
    xGuard: [userGuard, sysAdminGuard, tenantGuard],
    xRateLimiter: [singlePointsLimiter],
    summary: 'Delete connection',
    description: 'Removes a connection. Identities and sessions that came through it keep their rows; members stay members.',
    request: { params: connectionParamSchema },
    responses: { 200: json('Removed connection', connectionSchema, mockConnectionResponse()) },
  }),
});
