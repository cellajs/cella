import type { AccessScope } from 'shared';
import { createXRoutes, errors, json, jsonBody, xRoute } from '#/core/x-routes';
import { ltiToolGuard, orgGuard, publicGuard, stepUpFactorGuard, tenantGuard, userGuard } from '#/middlewares/guard';
import { ltiLaunchLimiter, singlePointsLimiter } from '#/middlewares/rate-limiter/limiters';
import { loginInitiationUrl } from '#/modules/lti-platform/helpers/launch-message';
import { mockLtiInstallationResponse, mockLtiMemberResponse, mockLtiResourceLinkResponse } from '#/modules/lti-platform/lti-platform-mocks';
import {
  approveLtiInstallationBodySchema,
  createLtiResourceLinkBodySchema,
  initiateLtiLoginQuerySchema,
  listLtiInstallationsQuerySchema,
  listLtiMembersQuerySchema,
  listLtiResourceLinksQuerySchema,
  ltiInstallationParamSchema,
  ltiInstallationSchema,
  ltiLaunchStartSchema,
  ltiMemberSchema,
  ltiResourceLinkParamSchema,
  ltiResourceLinkSchema,
  ltiToolRegistrationStartSchema,
  startLtiToolRegistrationBodySchema,
  updateLtiInstallationBodySchema,
  updateLtiResourceLinkBodySchema,
} from '#/modules/lti-platform/lti-platform-schema';
import { paginationSchema, tenantOrgParamSchema } from '#/schemas';

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
        url: 'https://peer-review.example.com/lti/register?openid_configuration=https%3A%2F%2Fapp.example.com%2Foauth%2Flti%2Fopenid-configuration&registration_token=example-registration-token',
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
    request: { params: tenantOrgParamSchema, query: listLtiInstallationsQuerySchema },
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
      'Approves a pending LTI tool: its service account becomes active, its launches may carry the personal fields released here, and its own tokens the access scopes granted here, each one the LTI tool asked for. Disable it later as a service account.',
    request: { params: ltiInstallationParamSchema, body: jsonBody(approveLtiInstallationBodySchema) },
    responses: { 200: json('Approved installation', ltiInstallationSchema), ...errors(409) },
  }),
  updateLtiInstallation: xRoute({
    method: 'patch',
    path: '/{ltiInstallationId}',
    xEnabledBy: { feature: 'ltiPlatform' },
    xGuard: [userGuard, tenantGuard, orgGuard, stepUpFactorGuard],
    xRateLimiter: [singlePointsLimiter],
    summary: 'Update LTI installation',
    description:
      "Replaces the access scopes an approved LTI tool's own tokens may carry, each one the LTI tool asked for. A token that carries a scope taken away here is refused at its next request. Requires permission to update the organization.",
    request: { params: ltiInstallationParamSchema, body: jsonBody(updateLtiInstallationBodySchema) },
    responses: { 200: json('Updated installation', ltiInstallationSchema), ...errors(409) },
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

/** An organization's resource links: LTI tools placed in its channels, and the launches they start. */
export const ltiResourceLinkRoutes = createXRoutes(['lti-platform', 'cella'], {
  listLtiResourceLinks: xRoute({
    method: 'get',
    path: '/',
    xEnabledBy: { feature: 'ltiPlatform' },
    xGuard: [userGuard, tenantGuard, orgGuard],
    summary: 'Get LTI resource links',
    description: 'The LTI tools placed in a channel, by default in the order their tabs show. Requires permission to read the channel.',
    request: { params: tenantOrgParamSchema, query: listLtiResourceLinksQuerySchema },
    responses: {
      200: json('LTI resource links', paginationSchema(ltiResourceLinkSchema), { results: [mockLtiResourceLinkResponse()], totalSize: 1 }),
    },
  }),
  createLtiResourceLink: xRoute({
    method: 'post',
    path: '/',
    xEnabledBy: { feature: 'ltiPlatform' },
    xGuard: [userGuard, tenantGuard, orgGuard],
    xRateLimiter: [singlePointsLimiter],
    summary: 'Create LTI resource link',
    description:
      "Places an approved LTI installation of the organization's tenant in a channel, as a tab that launches it. Requires permission to update the channel, and the course it launches as when that is a channel above it.",
    request: { params: tenantOrgParamSchema, body: jsonBody(createLtiResourceLinkBodySchema) },
    responses: { 201: json('LTI resource link', ltiResourceLinkSchema), ...errors(409) },
  }),
  updateLtiResourceLink: xRoute({
    method: 'patch',
    path: '/{ltiResourceLinkId}',
    xEnabledBy: { feature: 'ltiPlatform' },
    xGuard: [userGuard, tenantGuard, orgGuard],
    xRateLimiter: [singlePointsLimiter],
    summary: 'Update LTI resource link',
    description: 'Renames a resource link or replaces its custom values. Requires permission to update its channel.',
    request: { params: ltiResourceLinkParamSchema, body: jsonBody(updateLtiResourceLinkBodySchema) },
    responses: { 200: json('LTI resource link', ltiResourceLinkSchema) },
  }),
  deleteLtiResourceLink: xRoute({
    method: 'delete',
    path: '/{ltiResourceLinkId}',
    xEnabledBy: { feature: 'ltiPlatform' },
    xGuard: [userGuard, tenantGuard, orgGuard],
    xRateLimiter: [singlePointsLimiter],
    summary: 'Delete LTI resource link',
    description: 'Removes a resource link and its launches that have not reached the LTI tool. Requires permission to update its channel.',
    request: { params: ltiResourceLinkParamSchema },
    responses: { 204: { description: 'Resource link deleted' } },
  }),
  startLtiLaunch: xRoute({
    method: 'post',
    path: '/{ltiResourceLinkId}/~start-launch',
    xEnabledBy: { feature: 'ltiPlatform' },
    xGuard: [userGuard, tenantGuard, orgGuard],
    xRateLimiter: [singlePointsLimiter],
    summary: 'Start LTI launch',
    description:
      "Starts a launch of the resource link's LTI tool for the signed-in user: a one-use launch record, answered as the login initiation page a frame loads. The launch endpoint checks again, when the LTI tool comes back, that the user may read the channel. Requires permission to read its channel and an active installation.",
    request: { params: ltiResourceLinkParamSchema },
    responses: {
      200: json('Launch started', ltiLaunchStartSchema, {
        url: `${loginInitiationUrl}?token=example-launch-token`,
        expiresAt: '2026-11-18T13:05:00.000Z',
      }),
      ...errors(409),
    },
  }),
});

/** The login initiation page a launch frame loads, outside any session: the launch record in its address is the proof. */
export const ltiLaunchRoutes = createXRoutes(['lti-platform', 'cella'], {
  initiateLtiLaunchLogin: xRoute({
    method: 'get',
    path: '/~initiate-login',
    xEnabledBy: { feature: 'ltiPlatform' },
    xGuard: [publicGuard],
    xRateLimiter: [ltiLaunchLimiter],
    summary: 'Initiate LTI login',
    description:
      "The page a launch frame loads: it posts the login initiation (1EdTech Security Framework, section 5.1.1.1) to the LTI tool's login address, with hints that refer to the launch record. Loading it leaves the record for the launch endpoint, which spends it.",
    request: { query: initiateLtiLoginQuerySchema },
    responses: {
      200: { description: 'Login initiation\n\nA page that posts the login initiation to the LTI tool as it loads.' },
      401: { description: 'Launch record refused\n\nA page with one line of text: the record was used before, never existed or expired.' },
    },
  }),
});

/**
 * The routes an installed LTI tool calls with a token of its own (`ltiToolGuard`), for the courses it is placed in or
 * below. `ltiToolScopes` reads the scopes of this list alone.
 */
const ltiToolRouteDrafts = {
  listLtiMembers: xRoute({
    method: 'get',
    path: '/',
    xEnabledBy: { feature: 'ltiPlatform' },
    xGuard: [ltiToolGuard, tenantGuard, orgGuard],
    xScope: 'user:read',
    summary: 'Get LTI members',
    description:
      "The people of a course an installed LTI tool is placed in or below, for the LTI tool's own token: each person's id, the same a launch sends as `sub`, their LTI roles in the course and the personal claims a launch would carry. A course is the channel a launch names as its LTI context; the address comes in the launch. It answers whom the installation's least privileged role there may see, ordered by id. Any other channel answers as one it may not read.",
    request: { params: tenantOrgParamSchema, query: listLtiMembersQuerySchema },
    responses: {
      200: json('LTI members', paginationSchema(ltiMemberSchema), { results: [mockLtiMemberResponse()], totalSize: 1 }),
    },
  }),
};

export const ltiMemberRoutes = createXRoutes(['lti-platform', 'cella'], ltiToolRouteDrafts);

/**
 * The access scopes the routes for installed LTI tools declare (`xScope`): the only ones a registration records, the
 * platform's configuration advertises and an admin grants.
 */
export const ltiToolScopes: AccessScope[] = [...new Set(Object.values(ltiToolRouteDrafts).map((route) => route.xScope))];
