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
  "A platform's login initiation for a launch (LTI 1.3, OIDC third-party login), as a GET or a form post from the platform's frame. Finds the active LTI connection by issuer and client id, stores a one-use nonce and answers a page that puts the nonce's value into platform storage, then goes on to the platform's authorization endpoint. A platform that offers no platform storage cannot launch the app. Its page may be framed by the origin of the platform's authorization endpoint and the origin of the platform's own pages its registration recorded; a refusal, text only, by any page.";

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
      "The registration link an organization admin pastes into an LTI platform, which opens it in a frame (LTI Dynamic Registration). Checks the one-use link, the tenant's quota of LTI connections and the configuration's address, then spends the link, reads the platform's OpenID configuration, registers the app as an LTI tool and stores the connection for the link's tenant. A refusal before the link is spent leaves it usable. Any LTI platform may frame the page, which holds no session.",
    request: { query: ltiRegisterQuerySchema },
    responses: {
      200: { description: 'Registered\n\nA page with one line of text that sends the platform the close message as it loads.' },
      400: {
        description:
          'Registration refused\n\nA page naming why the configuration address, the platform or its answer was refused, with a button that sends the close message. A refused address leaves the link usable.',
      },
      401: { description: 'Registration link refused\n\nThe refusal page: the link was used before, never existed or expired.' },
      403: {
        description:
          'Connection limit reached\n\nThe refusal page: the tenant holds as many LTI connections as its quota allows. Found before the link is spent, it leaves the link usable; found under the quota lock after, it says the link is used.',
      },
      409: {
        description:
          "Client id taken\n\nThe refusal page: the platform gave a client id a connection holds already, named only when the link's tenant holds it.",
      },
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
    // The spec names the storage frame in the login address (LTI OIDC Login with Client Side postMessages 0.1, section 2.1).
    request: { query: ltiLoginParamsSchema.pick({ lti_storage_target: true }), body: formBody(ltiLoginParamsSchema) },
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
      "The key set of one LTI connection, the `jwks_uri` the app registered at its platform: the public halves of the connection's own keys, which sign the client assertions the app sends that platform alone. It holds one key, and two while the key rotates: the next key is published days before it signs, and the key it replaces stays days after. It answers from before the platform answers the registration until the connection is deleted, and a platform may keep it five minutes. A connection without a key that decrypts answers 404.",
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
      "Posted same-origin by the launch page; a request the browser does not mark same-origin is refused. Checks the ID token in the order of the 1EdTech Security Framework and spends the login's nonce with the value platform storage held. Maps the launch's context to a channel, finds or creates the person by the platform's issuer and user id and applies the mapped role there. A launch without a context, or with one the app maps to no channel (by default one whose types name no course or group, such as a Canvas account), signs in only a person known here as a member of the organization, and adds no membership, role or seat. Then it starts the embedded session in a partitioned cookie and redirects to the channel's embedded page. Refusals answer a page naming why.",
    request: { body: formBody(ltiFinishFormSchema) },
    responses: {
      303: { description: 'Launched\n\nTo the embedded page of the channel, with the embedded session set.', headers: locationSchema },
      400: { description: "Launch refused\n\nThe platform's key set could not be read, or a field is longer than a launch carries." },
      401: { description: 'Launch not valid\n\nA page naming the check the launch failed, or the platform it names is not connected.' },
      403: {
        description:
          'Launch refused\n\nA page: not same-origin, a launch without a deployment or from one past what the connection takes, an anonymous launch, a launch without a role the app takes, a test user, a launch without a context by someone not known here yet, an archived channel, or a new member when the organization has no seat left.',
      },
      404: { description: "Organization gone\n\nA page: the connection's tenant holds no organization." },
      409: { description: 'Not set up yet\n\nA page: someone who sets the context up opens the app from it first.' },
    },
  }),
});

/** The LTI contexts of an organization's LTI connections, for a user who may update the organization. */
export const ltiContextRoutes = createXRoutes(['connections', 'cella'], {
  listLtiContexts: xRoute({
    method: 'get',
    path: '/',
    xEnabledBy: { strategy: 'lti' },
    xGuard: [userGuard, tenantGuard, orgGuard],
    summary: 'Get LTI contexts',
    description:
      "The contexts of the LTI connections of the organization's tenant, or of the one `connectionId` names, that a launch mapped to one of the organization's channels, each with how its last member import ran. Requires permission to update the organization.",
    request: { params: tenantOrgParamSchema, query: listLtiContextsQuerySchema },
    responses: { 200: json('LTI contexts', paginationSchema(ltiContextSchema), { results: [mockLtiContextResponse()], totalSize: 1 }) },
  }),
});
