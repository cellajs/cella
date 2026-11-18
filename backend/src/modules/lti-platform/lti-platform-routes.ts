import { createXRoutes, errors, json, jsonBody, xRoute } from '#/core/x-routes';
import { orgGuard, stepUpFactorGuard, tenantGuard, userGuard } from '#/middlewares/guard';
import { singlePointsLimiter } from '#/middlewares/rate-limiter/limiters';
import { ltiIssuerUrl } from '#/modules/lti-platform/helpers/platform-offer';
import { mockLtiInstallationResponse } from '#/modules/lti-platform/lti-platform-mocks';
import {
  approveLtiInstallationBodySchema,
  ltiInstallationParamSchema,
  ltiInstallationSchema,
  ltiToolRegistrationStartSchema,
  startLtiToolRegistrationBodySchema,
} from '#/modules/lti-platform/lti-platform-schema';
import { pageQuerySchema, paginationSchema, tenantOrgParamSchema } from '#/schemas';

/** An organization's LTI tools, for a user who may update the organization; every decision asks a recent step-up. */
export const ltiPlatformRoutes = createXRoutes(['lti-platform', 'cella'], {
  startLtiToolRegistration: xRoute({
    method: 'post',
    path: '/~start-registration',
    xEnabledBy: { feature: 'ltiPlatform' },
    xGuard: [userGuard, tenantGuard, orgGuard, stepUpFactorGuard],
    xRateLimiter: [singlePointsLimiter],
    summary: 'Start LTI tool registration',
    description:
      "Starts an LTI tool's Dynamic Registration: answers the LTI tool's registration address with the platform's configuration address and a one-use registration token added, to open in a frame or a new tab. The LTI tool registers itself with the token; its registration is private to the organization's tenant and waits for an admin's approval. Requires permission to update the organization.",
    request: { params: tenantOrgParamSchema, body: jsonBody(startLtiToolRegistrationBodySchema) },
    responses: {
      200: json('Registration address', ltiToolRegistrationStartSchema, {
        url: `https://peer-review.example.com/lti/register?openid_configuration=${encodeURIComponent(ltiIssuerUrl('configuration'))}&registration_token=V1StGXR8_Z5jdHi6B-myTV1StGXR8_Z5jdHi6B-my`,
        expiresAt: '2026-11-18T13:00:00.000Z',
      }),
    },
  }),
  listLtiInstallations: xRoute({
    method: 'get',
    path: '/',
    xEnabledBy: { feature: 'ltiPlatform' },
    xGuard: [userGuard, tenantGuard, orgGuard],
    summary: 'Get LTI installations',
    description:
      "The LTI tools installed in the organization's tenant, pending, approved or disabled, each with its registration. Requires permission to update the organization.",
    request: { params: tenantOrgParamSchema, query: pageQuerySchema },
    responses: {
      200: json('LTI installations', paginationSchema(ltiInstallationSchema), { results: [mockLtiInstallationResponse()], totalSize: 1 }),
    },
  }),
  approveLtiInstallation: xRoute({
    method: 'post',
    path: '/{ltiInstallationId}/~approve',
    xEnabledBy: { feature: 'ltiPlatform' },
    xGuard: [userGuard, tenantGuard, orgGuard, stepUpFactorGuard],
    xRateLimiter: [singlePointsLimiter],
    summary: 'Approve LTI installation',
    description:
      'Approves a pending LTI tool: its service account becomes active, and its launches may carry the personal fields released here, each one the LTI tool asked for. Disable it later as a service account.',
    request: { params: ltiInstallationParamSchema, body: jsonBody(approveLtiInstallationBodySchema) },
    responses: { 200: json('Approved installation', ltiInstallationSchema), ...errors(409) },
  }),
  rejectLtiInstallation: xRoute({
    method: 'post',
    path: '/{ltiInstallationId}/~reject',
    xEnabledBy: { feature: 'ltiPlatform' },
    xGuard: [userGuard, tenantGuard, orgGuard, stepUpFactorGuard],
    xRateLimiter: [singlePointsLimiter],
    summary: 'Reject LTI installation',
    description: 'Rejects a pending LTI tool. It never acted: its installation and its registration are deleted.',
    request: { params: ltiInstallationParamSchema },
    responses: { 204: { description: 'Installation rejected' }, ...errors(409) },
  }),
});
