import { createXRoutes, errors, json, jsonBody, xRoute } from '#/core/x-routes';
import { sysAdminGuard, tenantGuard, userGuard } from '#/middlewares/guard';
import { singlePointsLimiter } from '#/middlewares/rate-limiter/limiters';
import { mockConnectionResponse } from '#/modules/connections/connections-mocks';
import {
  connectionParamSchema,
  connectionSchema,
  createConnectionBodySchema,
  updateConnectionBodySchema,
} from '#/modules/connections/connections-schema';
import { pageQuerySchema, paginationSchema, tenantOnlyParamSchema } from '#/schemas';

const connectionRoutes = createXRoutes(['connections', 'cella'], {
  listConnections: xRoute({
    method: 'get',
    path: '/',
    xEnabledBy: { strategy: 'sso' },
    xGuard: [userGuard, sysAdminGuard, tenantGuard],
    summary: 'Get connections',
    description:
      "The tenant's connections: the institutions whose members sign in to its organization through an SSO federation. System admin access required.",
    request: { params: tenantOnlyParamSchema, query: pageQuerySchema },
    responses: { 200: json('Connections', paginationSchema(connectionSchema), { results: [mockConnectionResponse()], totalSize: 1 }) },
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
    responses: { 201: json('Created connection', connectionSchema), ...errors(409) },
  }),
  updateConnection: xRoute({
    method: 'patch',
    path: '/{connectionId}',
    xEnabledBy: { strategy: 'sso' },
    xGuard: [userGuard, sysAdminGuard, tenantGuard],
    xRateLimiter: [singlePointsLimiter],
    summary: 'Update connection',
    description: 'Changes the name, domains, IdP entity ids, status or provisioning of a connection; the federation stays what it was.',
    request: { params: connectionParamSchema, body: jsonBody(updateConnectionBodySchema) },
    responses: { 200: json('Updated connection', connectionSchema), ...errors(404, 409) },
  }),
  deleteConnection: xRoute({
    method: 'delete',
    path: '/{connectionId}',
    xEnabledBy: { strategy: 'sso' },
    xGuard: [userGuard, sysAdminGuard, tenantGuard],
    xRateLimiter: [singlePointsLimiter],
    summary: 'Delete connection',
    description: 'Removes a connection. Identities and sessions that came through it keep their rows; members stay members.',
    request: { params: connectionParamSchema },
    responses: { 204: { description: 'Connection removed' }, ...errors(404) },
  }),
});

export { connectionRoutes };
