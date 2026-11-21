import { appConfig } from 'shared';
import { canvasMembers, ltiNrps, ltiToolConfigurationMember } from '#/lib/lti-vocabulary';

/** Where a platform starts a launch's login. */
const ltiLoginUrl = () => `${appConfig.backendAuthUrl}/lti/login`;

/** Where a platform posts a launch: the one `redirect_uri` the app registers. */
export const ltiLaunchUrl = () => `${appConfig.backendAuthUrl}/lti/launch`;

/** The key set of one LTI connection (`getLtiKeySet`): the public key its client assertions are signed with. */
export const ltiKeySetUrl = (connectionId: string) => `${appConfig.backendAuthUrl}/lti/connections/${connectionId}/jwks`;

/**
 * The app as an LTI tool in a Dynamic Registration request for the connection `connectionId`, at a platform of the
 * product family `productFamilyCode`. A platform verifies the app's signatures against that connection's key set alone.
 * The grant and scope ask the platform for its contexts' members (NRPS). A platform that grants neither still launches
 * the app. The claims ask for a person's name, and for their email with `ltiAsksEmail`.
 *
 * Canvas gets members of its own. Without a placement it makes the launch a link a teacher picks for a module: the
 * launch names a course tab, off until a teacher enables it. Its `members` visibility shows the tab to whoever takes
 * part as a student or reads the course as an admin, an account admin who is not enrolled included. Canvas's code and
 * its documentation disagree on what an absent privacy level means: the request names the one its claims ask for.
 */
export const ltiRegistrationRequest = (connectionId: string, productFamilyCode: string) => {
  const canvas = productFamilyCode === 'canvas';
  return {
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
      claims: ['iss', 'sub', 'name', 'given_name', 'family_name', ...(appConfig.ltiAsksEmail ? ['email'] : [])],
      messages: [
        {
          type: 'LtiResourceLinkRequest',
          label: appConfig.name,
          ...(canvas && { placements: ['course_navigation'], [canvasMembers.courseTabDefaultEnabled]: false, [canvasMembers.visibility]: 'members' }),
        },
      ],
      ...(canvas && { [canvasMembers.privacyLevel]: appConfig.ltiAsksEmail ? 'public' : 'name_only' }),
    },
  };
};
