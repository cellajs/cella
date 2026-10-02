import { createXRoutes, json, jsonBody, xRoute } from '#/core/x-routes';
import { orgGuard, tenantGuard, userGuard } from '#/middlewares/guard';
import { singlePointsLimiter, yjsHttpLimiter } from '#/middlewares/rate-limiter/limiters';
import {
  yjsPullBodySchema,
  yjsPullResponseSchema,
  yjsPushBodySchema,
  yjsPushResponseSchema,
  yjsTokenQuerySchema,
  yjsTokenResponseSchema,
} from '#/modules/yjs/yjs-schema';
import { tenantOrgParamSchema } from '#/schemas';

const yjsRoutes = createXRoutes(['yjs', 'cella'], {
  getYjsToken: xRoute({
    method: 'get',
    path: '/token',
    xEnabledBy: { service: 'yjs' },
    xGuard: [userGuard, tenantGuard, orgGuard],
    xRateLimiter: [singlePointsLimiter],
    summary: 'Get Yjs token',
    description:
      'Returns an Ed25519-signed token for collaboratively editing one product entity the caller may update. It names the entity, its tenant and organization, and expires after five minutes; the Yjs relay worker verifies it with the public key alone, without a backend callback, and closes the socket when it expires.',
    request: { params: tenantOrgParamSchema, query: yjsTokenQuerySchema },
    responses: { 200: json('Yjs auth token', yjsTokenResponseSchema) },
  }),
  pullYjsDocument: xRoute({
    method: 'post',
    path: '/pull',
    xEnabledBy: { service: 'yjs' },
    xGuard: [userGuard, tenantGuard, orgGuard],
    xRateLimiter: [yjsHttpLimiter],
    summary: 'Pull Yjs document',
    description:
      "Returns what the caller's copy of one product entity's collaborative document lacks, for a client that cannot reach the Yjs relay: the document's generation, an update holding what the caller's state vector lacks, and the server's state vector. A document never opened is seeded from the stored description first, as the relay seeds it. The caller must be allowed to update the entity, as for a Yjs token. A POST, since a state vector can outgrow a URL. Costs no API points.",
    request: { params: tenantOrgParamSchema, body: jsonBody(yjsPullBodySchema) },
    responses: { 200: json('Document diff', yjsPullResponseSchema) },
  }),
  pushYjsUpdate: xRoute({
    method: 'post',
    path: '/push',
    xEnabledBy: { service: 'yjs' },
    xGuard: [userGuard, tenantGuard, orgGuard],
    xRateLimiter: [yjsHttpLimiter],
    summary: 'Push Yjs update',
    description:
      "Appends one Yjs update to a product entity's collaborative document, for a client that cannot reach the Yjs relay. The answer follows the commit, so a 200 means the server holds the update; the relay passes it to live sessions and folds it into the document. An update made in another generation than the document's answers 409 with the current one. At most 512 KB of update per request, base64url-encoded. The caller must be allowed to update the entity, as for a Yjs token. Costs no API points.",
    request: { params: tenantOrgParamSchema, body: jsonBody(yjsPushBodySchema) },
    responses: { 200: json('Saved', yjsPushResponseSchema) },
  }),
});

export { yjsRoutes };
