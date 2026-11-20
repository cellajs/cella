import { appConfig } from 'shared';
import { ltiNrps, ltiToolConfigurationMember } from '#/lib/lti-vocabulary';

/** Where a platform starts a launch's login. */
const ltiLoginUrl = () => `${appConfig.backendAuthUrl}/lti/login`;

/** Where a platform posts a launch: the one `redirect_uri` the app registers. */
export const ltiLaunchUrl = () => `${appConfig.backendAuthUrl}/lti/launch`;

/** The key set of one LTI connection (`getLtiKeySet`): the public key its client assertions are signed with. */
export const ltiKeySetUrl = (connectionId: string) => `${appConfig.backendAuthUrl}/lti/connections/${connectionId}/jwks`;

/**
 * The app as an LTI tool in a Dynamic Registration request for the connection `connectionId`. A platform verifies the
 * app's signatures against that connection's key set alone. The grant and scope ask the platform for its contexts'
 * members (NRPS). A platform that grants neither still launches the app.
 */
export const ltiRegistrationRequest = (connectionId: string) => ({
  application_type: 'web',
  grant_types: ['client_credentials', 'implicit'],
  response_types: ['id_token'],
  token_endpoint_auth_method: 'private_key_jwt',
  client_name: appConfig.name,
  logo_uri: `${appConfig.frontendUrl}/favicon.svg`,
  initiate_login_uri: ltiLoginUrl(),
  redirect_uris: [ltiLaunchUrl()],
  jwks_uri: ltiKeySetUrl(connectionId),
  scope: ltiNrps.scope,
  [ltiToolConfigurationMember]: {
    domain: new URL(appConfig.backendUrl).host,
    target_link_uri: ltiLaunchUrl(),
    claims: ['iss', 'sub', 'name', 'given_name', 'family_name', 'email'],
    messages: [{ type: 'LtiResourceLinkRequest' }],
  },
});
