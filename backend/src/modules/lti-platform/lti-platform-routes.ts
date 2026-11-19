import type { AccessScope } from 'shared';
import { createXRoutes, errors, json, jsonBody, xRoute } from '#/core/x-routes';
import { ltiNrps } from '#/lib/lti-vocabulary';
import { ltiToolGuard, orgGuard, publicGuard, stepUpFactorGuard, tenantGuard, userGuard } from '#/middlewares/guard';
import { ltiLaunchLimiter, singlePointsLimiter } from '#/middlewares/rate-limiter/limiters';
import { loginInitiationUrl } from '#/modules/lti-platform/helpers/launch-message';
import { ltiServiceScope } from '#/modules/lti-platform/helpers/lti-service-scopes';
import {
  mockLtiInstallationResponse,
  mockLtiMembershipContainerResponse,
  mockLtiResourceLinkResponse,
} from '#/modules/lti-platform/lti-platform-mocks';
import {
  approveLtiInstallationBodySchema,
  createLtiResourceLinkBodySchema,
  initiateLtiLoginQuerySchema,
  listLtiInstallationsQuerySchema,
  listLtiInstallationTabsQuerySchema,
  listLtiMembersQuerySchema,
  listLtiResourceLinksQuerySchema,
  listLtiTabsQuerySchema,
  ltiInstallationParamSchema,
  ltiInstallationSchema,
  ltiInstallationTabSchema,
  ltiLaunchStartSchema,
  ltiMembershipContainerSchema,
  ltiMembershipsParamSchema,
  ltiResourceLinkParamSchema,
  ltiResourceLinkSchema,
  ltiTabSchema,
  ltiToolRegistrationStartSchema,
  minLtiMembersPage,
  startLtiToolRegistrationBodySchema,
  updateLtiInstallationBodySchema,
  updateLtiResourceLinkBodySchema,
} from '#/modules/lti-platform/lti-platform-schema';
import { paginationSchema, tenantOrgParamSchema } from '#/schemas';

/** An organization's LTI tools and where each has tabs, for a user who may update the organization; every decision asks a recent step-up. */
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
  listLtiInstallationTabs: xRoute({
    method: 'get',
    path: '/{ltiInstallationId}/tabs',
    xEnabledBy: { feature: 'ltiPlatform' },
    xGuard: [userGuard, tenantGuard, orgGuard],
    summary: 'Get tabs of LTI installation',
    description:
      'Every tab of an LTI tool in the organization, on or off: the channel it sits in, by name, and whether the caller may remove it. The LTI tool reads the people of the channels of its tabs that are on. Requires permission to update the organization.',
    request: { params: ltiInstallationParamSchema, query: listLtiInstallationTabsQuerySchema },
    responses: {
      200: json('Tabs of the installation', paginationSchema(ltiInstallationTabSchema), {
        results: [
          {
            id: mockLtiResourceLinkResponse().id,
            channelType: 'organization',
            channelId: mockLtiResourceLinkResponse().channelId,
            channelName: 'Biology department',
            enabled: true,
            audience: 'members',
            deletable: true,
          },
        ],
        totalSize: 1,
      }),
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
      'Approves a pending LTI tool: its service account becomes active, its launches may carry the personal fields released here, and its own tokens the access scopes granted here, each one the LTI tool asked for. Channels of the types allowed here may switch its tab on; none is allowed by default. Disable it later as a service account.',
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
      "Replaces the access scopes an approved LTI tool's own tokens may carry, each one the LTI tool asked for, or the channel types it may get a tab in. A token that carries a scope taken away here is refused at its next request, and its tabs that are on in a channel type taken away are switched off, keeping their ids. Requires permission to update the organization.",
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
  deleteLtiInstallation: xRoute({
    method: 'delete',
    path: '/{ltiInstallationId}',
    xEnabledBy: { feature: 'ltiPlatform' },
    xGuard: [userGuard, tenantGuard, orgGuard, stepUpFactorGuard],
    xRateLimiter: [singlePointsLimiter],
    summary: 'Delete LTI installation',
    description:
      'Deletes an LTI tool for good, waiting, approved or disabled: its registration, its service account, its tabs in every channel and their launches that have not reached the LTI tool. Its tokens are refused at their next request. Adding it again takes a new registration. Requires permission to update the organization, and the step-up an approval asks.',
    request: { params: ltiInstallationParamSchema },
    responses: { 204: { description: 'Installation deleted' } },
  }),
});

/** A channel's tabs of LTI tools, for a user who may update the channel. */
export const ltiTabRoutes = createXRoutes(['lti-platform', 'cella'], {
  listLtiTabs: xRoute({
    method: 'get',
    path: '/',
    xEnabledBy: { feature: 'ltiPlatform' },
    xGuard: [userGuard, tenantGuard, orgGuard],
    summary: 'Get LTI tabs',
    description:
      "A channel's tabs of LTI tools: each approved LTI tool of the organization's tenant, a disabled one only where it has a tab in the channel, whether a tab there lets it read who is in the channel, why the caller may not place it or switch it on, and its resource link once placed, on or off. None in a channel type that holds no tabs: one the app makes no LTI context, other than the organization. Requires permission to update the channel.",
    request: { params: tenantOrgParamSchema, query: listLtiTabsQuerySchema },
    responses: {
      200: json('LTI tabs', paginationSchema(ltiTabSchema), {
        results: [
          {
            id: mockLtiInstallationResponse().id,
            name: 'Peer review',
            launchOrigins: mockLtiInstallationResponse().launchOrigins,
            createdAt: mockLtiInstallationResponse().createdAt,
            status: 'active',
            readsMembers: true,
            refusal: null,
            resourceLink: { id: mockLtiResourceLinkResponse().id, title: 'Peer review', enabled: true, audience: 'members' },
          },
        ],
        totalSize: 1,
      }),
    },
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
    description:
      "The tabs of LTI tools switched on in a channel that open for the caller, by default in the order they follow until the channel's own tab order names them. A tab for its members opens for whoever holds a membership in the channel, and one for its editors for whoever may update it; a launch decides alike. Tabs switched off are listed for whoever may switch them, in the channel's LTI tabs. Requires permission to read the channel.",
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
      "Places an approved LTI installation of the organization's tenant in a channel, as a tab that launches it as that channel; a channel holds one tab of an installation, and a channel type the app makes no LTI context holds none, the organization excepted. Requires permission to update the channel.",
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
    description:
      'Renames a resource link, replaces its custom values, changes whom its tab opens for, or switches it on or off, keeping its id. Requires permission to update its channel; switching on also takes an active LTI tool.',
    request: { params: ltiResourceLinkParamSchema, body: jsonBody(updateLtiResourceLinkBodySchema) },
    responses: { 200: json('LTI resource link', ltiResourceLinkSchema), ...errors(409) },
  }),
  deleteLtiResourceLink: xRoute({
    method: 'delete',
    path: '/{ltiResourceLinkId}',
    xEnabledBy: { feature: 'ltiPlatform' },
    xGuard: [userGuard, tenantGuard, orgGuard],
    xRateLimiter: [singlePointsLimiter],
    summary: 'Delete LTI resource link',
    description:
      'Removes a tab for good: its resource link and its launches that have not reached the LTI tool. What the LTI tool keeps under its id may be lost, which switching the tab off avoids. Requires permission to update its channel.',
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
      "Starts a launch of the resource link's LTI tool for the signed-in user: a one-use launch record, answered as the login initiation page a frame loads. The launch endpoint checks again, when the LTI tool comes back, that the user may read the channel and that the tab opens for them. Requires permission to read its channel, a place in the tab's audience, which a 404 refuses as a tab that does not exist, and an active installation.",
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
 * The routes an installed LTI tool calls with a token of its own (`ltiToolGuard`), for the LTI context in their path. Each
 * keeps the shape of the LTI service it serves. `ltiToolScopes` reads the scopes of this list alone.
 */
const ltiToolRouteDrafts = {
  listLtiMembers: xRoute({
    method: 'get',
    path: '/{channelType}/{channelId}',
    xEnabledBy: { feature: 'ltiPlatform' },
    xGuard: [ltiToolGuard, tenantGuard, orgGuard],
    xScope: 'user:read',
    // A token carries `user:read`, which an LTI tool asks for by its NRPS name alone.
    security: [{ oauth2: [ltiNrps.scope] }],
    summary: 'Get LTI members',
    description: `The members of a channel where an installed LTI tool has a tab that is on, as Names and Role Provisioning Services 2.0 (NRPS) lists them, for the LTI tool's own token. The channel is the LTI context a launch of that tab names, and a launch's NRPS claim carries this address. Each member is the id a launch sends as \`sub\`, their LTI roles there from their membership there, and the personal claims a launch would carry. It answers whom the installation's least privileged role there may see, ordered by id, and a \`Link\` header continues to the next page. \`limit\` is a hint, at least ${minLtiMembersPage}. A resource link's members (\`rlid\`) and the differences link are not served. A channel where it has no tab that is on, a channel above or below one, or a channel type the app does not have, answers 403, as for an installation placed nowhere`,

    request: { params: ltiMembershipsParamSchema, query: listLtiMembersQuerySchema },
    responses: {
      200: {
        description: 'LTI members',
        headers: { Link: { description: 'The next page as `<address>; rel="next"`, while the channel lists more', schema: { type: 'string' } } },
        content: { [ltiNrps.mediaType]: { schema: ltiMembershipContainerSchema, example: mockLtiMembershipContainerResponse() } },
      },
    },
  }),
};

export const ltiMemberRoutes = createXRoutes(['lti-platform', 'cella'], ltiToolRouteDrafts);

/**
 * The access scopes the routes for installed LTI tools declare (`xScope`), each standing for an LTI service scope
 * (`ltiServiceScope`): the only ones a registration records, the platform's configuration offers by their service
 * names and an admin grants.
 */
export const ltiToolScopes: AccessScope[] = [...new Set(Object.values(ltiToolRouteDrafts).map((route) => route.xScope))];

// A route scope without a service name could be neither asked for nor granted: the module refuses to load.
const unnamed = ltiToolScopes.find((scope) => !ltiServiceScope(scope));
if (unnamed) throw new Error(`[lti] The scope ${unnamed} of a route for installed LTI tools has no LTI service scope in lti-service-scopes.ts.`);
