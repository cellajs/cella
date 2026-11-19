import { createXRoutes, errors, json, xRoute } from '#/core/x-routes';
import { orgGuard, publicGuard, tenantGuard, userGuard } from '#/middlewares/guard';
import { ltiKeySetLimiter, ltiLaunchLimiter, ltiLoginLimiter } from '#/middlewares/rate-limiter/limiters';
import { mockLtiContextResponse } from '#/modules/auth/auth-mocks';
import {
  listLtiContextsQuerySchema,
  ltiContextSchema,
  ltiFinishFormSchema,
  ltiKeySetParamSchema,
  ltiKeySetSchema,
  ltiLaunchFormSchema,
  ltiLoginParamsSchema,
  ltiRegisterQuerySchema,
} from '#/modules/auth/flows/lti/lti-schema';
import { locationSchema, paginationSchema, tenantOrgParamSchema } from '#/schemas';

/** A form post's body, required: an optional body skips validation on a request without a Content-Type. */
const formBody = <T>(schema: T) => ({ content: { 'application/x-www-form-urlencoded': { schema } }, required: true });

const loginDescription =
  "A platform's login initiation for a launch (LTI 1.3, OIDC third-party login), as a GET or a form post from the platform's frame. Finds the active LTI connection by issuer and client id, stores a one-use nonce and answers a page that puts the nonce's value into platform storage, then goes on to the platform's authorization endpoint. A platform that offers no platform storage cannot launch the app. Its page may be framed by the connection's platform alone; a refusal, text only, by any page.";

const loginResponses = {
  200: { description: 'Login page\n\nA page that stores the launch value in platform storage and moves on to the platform.' },
  400: { description: 'Login refused\n\nA page naming why: the platform offers no platform storage.' },
  401: { description: 'Platform unknown\n\nA page: no active LTI connection matches the issuer and client id, or the login hint is missing.' },
};

export const authLtiRoutes = createXRoutes(['auth', 'cella'], {
  registerLtiPlatform: xRoute({
    method: 'get',
    path: '/lti/register',
    xEnabledBy: { strategy: 'lti' },
    xGuard: [publicGuard],
    summary: 'Register at an LTI platform',
    description:
      "The registration link an organization admin pastes into an LTI platform, which opens it in a frame (LTI Dynamic Registration). Checks the one-use link and the tenant's quota of LTI connections, then spends the link, reads the platform's OpenID configuration, registers the app as an LTI tool and stores the connection for the link's tenant. A refusal before the link is spent leaves it usable. Any LTI platform may frame the page, which holds no session.",
    request: { query: ltiRegisterQuerySchema },
    responses: {
      200: { description: 'Registered\n\nA page with one line of text that sends the platform the close message as it loads.' },
      400: {
        description:
          'Registration refused\n\nA page naming why the platform or its configuration was refused, with a button that sends the close message.',
      },
      401: { description: 'Registration link refused\n\nThe refusal page: the link was used before, never existed or expired.' },
      403: {
        description:
          'Connection limit reached\n\nThe refusal page: the tenant holds as many LTI connections as its quota allows. The link stays usable.',
      },
      409: { description: 'Already registered\n\nThe refusal page: the platform gave a client id it gave the app before.' },
    },
  }),
  initiateLtiLogin: xRoute({
    method: 'get',
    path: '/lti/login',
    xEnabledBy: { strategy: 'lti' },
    xGuard: [publicGuard],
    xRateLimiter: [ltiLoginLimiter],
    summary: 'Start an LTI launch',
    description: loginDescription,
    request: { query: ltiLoginParamsSchema },
    responses: loginResponses,
  }),
  initiateLtiLoginByPost: xRoute({
    method: 'post',
    path: '/lti/login',
    xEnabledBy: { strategy: 'lti' },
    xGuard: [publicGuard],
    xRateLimiter: [ltiLoginLimiter],
    summary: 'Start an LTI launch by form post',
    description: `${loginDescription} A cross-site form post by design: the CSRF check leaves it out.`,
    request: { body: formBody(ltiLoginParamsSchema) },
    responses: loginResponses,
  }),
  receiveLtiLaunch: xRoute({
    method: 'post',
    path: '/lti/launch',
    xEnabledBy: { strategy: 'lti' },
    xGuard: [publicGuard],
    xRateLimiter: [ltiLaunchLimiter],
    summary: 'Receive an LTI launch',
    description:
      "The launch address a platform posts the ID token to, cross-site by design: the CSRF check leaves it out. Acts on nothing: answers a page that reads the login's value back from platform storage, accepting an answer from the platform's origin alone, and posts it with the ID token and the state to the finish route.",
    request: { body: formBody(ltiLaunchFormSchema) },
    responses: {
      200: { description: 'Launch page\n\nA page that reads the launch value from platform storage and posts it on, same-origin.' },
      400: { description: 'Launch refused\n\nA field is longer than a launch carries.' },
      401: { description: 'Launch refused\n\nA page: the state names no active LTI connection, or the platform posted an error.' },
    },
  }),
  getLtiKeySet: xRoute({
    method: 'get',
    path: '/lti/connections/{connectionId}/jwks',
    xEnabledBy: { strategy: 'lti' },
    xGuard: [publicGuard],
    xRateLimiter: [ltiKeySetLimiter],
    summary: 'Get LTI key set',
    description:
      'The key set of one LTI connection, the `jwks_uri` the app registered at its platform: the public half of the key pair the connection was given at registration, which signs the client assertions the app sends that platform alone. It answers from before the platform answers the registration until the connection is deleted, and a platform may keep it five minutes. A connection without a key that decrypts answers 404.',
    request: { params: ltiKeySetParamSchema },
    responses: {
      200: {
        ...json('Key set', ltiKeySetSchema, {
          keys: [{ kty: 'RSA', n: 'example-modulus', e: 'AQAB', kid: 'example-key-id', alg: 'RS256', use: 'sig' }],
        }),
        headers: { 'Cache-Control': { description: 'How long a platform may keep the key set: five minutes', schema: { type: 'string' } } },
      },
      ...errors(404),
    },
  }),
  finishLtiLaunch: xRoute({
    method: 'post',
    path: '/lti/finish',
    xEnabledBy: { strategy: 'lti' },
    xGuard: [publicGuard],
    xRateLimiter: [ltiLaunchLimiter],
    summary: 'Finish an LTI launch',
    description:
      "Posted same-origin by the launch page; a request the browser does not mark same-origin is refused. Checks the ID token in the order of the 1EdTech Security Framework and spends the login's nonce with the value platform storage held. Finds or creates the person by the platform's issuer and user id, maps the launch's context to a channel, applies the mapped role, starts the embedded session in a partitioned cookie and redirects to the channel's embedded page. Refusals answer a page naming why.",
    request: { body: formBody(ltiFinishFormSchema) },
    responses: {
      303: { description: 'Launched\n\nTo the embedded page of the channel, with the embedded session set.', headers: locationSchema },
      400: { description: "Launch refused\n\nThe platform's key set could not be read, or a field is longer than a launch carries." },
      401: { description: 'Launch not valid\n\nA page naming the check the launch failed, or the platform it names is not connected.' },
      403: {
        description:
          'Launch refused\n\nA page: not same-origin, a deployment the connection does not hold, an anonymous launch, a launch without a roles claim, a test user, an archived course, or a new member when the organization has no seat left.',
      },
      404: { description: "Organization gone\n\nA page: the connection's tenant holds no organization." },
      409: { description: 'Course not set up\n\nA page: an instructor opens the app from this course first.' },
    },
  }),
});

/** The courses of an organization's LTI connections, for a user who may update the organization. */
export const ltiContextRoutes = createXRoutes(['connections', 'cella'], {
  listLtiContexts: xRoute({
    method: 'get',
    path: '/',
    xEnabledBy: { strategy: 'lti' },
    xGuard: [userGuard, tenantGuard, orgGuard],
    summary: 'Get LTI contexts',
    description:
      "The courses of the LTI connections of the organization's tenant, or of the one `connectionId` names, that a launch mapped to one of the organization's channels, each with how its last member import ran. Requires permission to update the organization.",
    request: { params: tenantOrgParamSchema, query: listLtiContextsQuerySchema },
    responses: { 200: json('LTI contexts', paginationSchema(ltiContextSchema), { results: [mockLtiContextResponse()], totalSize: 1 }) },
  }),
});
