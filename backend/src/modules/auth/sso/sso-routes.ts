import { createXRoutes, json, xRoute } from '#/core/x-routes';
import { publicGuard } from '#/middlewares/guard';
import { tokenLimiter } from '#/middlewares/rate-limiter/limiters';
import { mockSsoEntryResponse } from '#/modules/auth/auth-mocks';
import { oauthCallbackQuerySchema, oauthQuerySchema } from '#/modules/auth/oauth/oauth-schema';
import { ssoConnectionParamSchema, ssoEntrySchema, ssoFederationParamSchema } from '#/modules/auth/sso/sso-schema';
import { locationSchema } from '#/schemas';

export const authSsoRoutes = createXRoutes(['auth', 'cella'], {
  getSsoEntry: xRoute({
    method: 'get',
    path: '/sso/connections/{connectionId}',
    xEnabledBy: { strategy: 'sso' },
    xGuard: [publicGuard],
    summary: 'Get an SSO entry',
    description:
      "What the entry page of an institution's sign-in shows: the organization, the institution and whether sign-in is active. Public by the connection id, the link an institution shares with its members.",
    request: { params: ssoConnectionParamSchema },
    responses: { 200: json('SSO entry', ssoEntrySchema, mockSsoEntryResponse()) },
  }),
  startSso: xRoute({
    method: 'get',
    path: '/sso/connections/{connectionId}/start',
    xEnabledBy: { strategy: 'sso' },
    xGuard: [publicGuard],
    summary: 'Sign in through an institution',
    description:
      "Sends the browser to the connection's federation, pinned to the institution's identity providers, so its own picker is skipped. `type=connect` links the institution account to the signed-in user instead; other types are refused.",
    request: { params: ssoConnectionParamSchema, query: oauthQuerySchema },
    responses: { 302: { description: 'Redirect to the federation', headers: locationSchema } },
  }),
  startSsoFederation: xRoute({
    method: 'get',
    path: '/sso/federations/{federation}/start',
    xEnabledBy: { strategy: 'sso' },
    xGuard: [publicGuard],
    summary: 'Sign in through a federation',
    description:
      "Sends the browser to the federation without naming an institution: the federation's own picker lists the connected ones, and the callback finds the connection by the institution the sign-in asserts.",
    request: { params: ssoFederationParamSchema, query: oauthQuerySchema },
    responses: { 302: { description: 'Redirect to the federation', headers: locationSchema } },
  }),
  ssoCallback: xRoute({
    method: 'get',
    path: '/sso/callback',
    xEnabledBy: { strategy: 'sso' },
    xGuard: [publicGuard],
    xRateLimiter: [tokenLimiter('sso')],
    summary: 'Callback for SSO',
    description:
      'The redirect URI registered at every federation. Verifies the tokens, asserts the institution against the connection, signs the user in (creating the account and its membership on a first sign-in) or links the identity, and redirects to the frontend.',
    request: { query: oauthCallbackQuerySchema },
    responses: { 302: { description: 'Redirect to frontend', headers: locationSchema } },
  }),
});
