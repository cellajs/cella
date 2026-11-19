import { appConfig } from 'shared';
import { ltiNrps, ltiToolConfigurationMember } from '#/lib/lti-vocabulary';

/** Where a platform starts a launch's login. */
const ltiLoginUrl = () => `${appConfig.backendAuthUrl}/lti/login`;

/** Where a platform posts a launch: the one `redirect_uri` the app registers. */
export const ltiLaunchUrl = () => `${appConfig.backendAuthUrl}/lti/launch`;

/**
 * The app as an LTI tool in a Dynamic Registration request: every platform gets these members. A platform verifies
 * the app's signatures against the authorization server's key set, the one key set the app has. The grant and scope
 * ask the platform for its courses' members (NRPS). A platform that grants neither still launches the app.
 */
export const ltiRegistrationRequest = () => ({
  application_type: 'web',
  grant_types: ['client_credentials', 'implicit'],
  response_types: ['id_token'],
  token_endpoint_auth_method: 'private_key_jwt',
  client_name: appConfig.name,
  logo_uri: `${appConfig.frontendUrl}/favicon.svg`,
  initiate_login_uri: ltiLoginUrl(),
  redirect_uris: [ltiLaunchUrl()],
  jwks_uri: `${appConfig.oauthUrl}/jwks`,
  scope: ltiNrps.scope,
  [ltiToolConfigurationMember]: {
    domain: new URL(appConfig.backendUrl).host,
    target_link_uri: ltiLaunchUrl(),
    claims: ['iss', 'sub', 'name', 'given_name', 'family_name', 'email'],
    messages: [{ type: 'LtiResourceLinkRequest' }],
  },
});
