import { appConfig } from 'shared';
import { type LtiReleasableField, ltiReleasableFields } from '#/modules/lti-platform/lti-installations-db';

/** The platform's own LTI routes, as paths under the issuer; the OAuth worker serves them beside the provider. */
export const ltiIssuerPaths = {
  configuration: '/lti/openid-configuration',
  registration: '/lti/register',
  authorization: '/lti/authorize',
} as const;

/** The address of one of the platform's LTI routes: the issuer, the authorization server's, with the route's path. */
export const ltiIssuerUrl = (route: keyof typeof ltiIssuerPaths) => `${appConfig.oauthUrl}${ltiIssuerPaths[route]}`;

/** The message types an LTI tool may register for: the platform launches into a resource link and nothing else. */
export const ltiMessageTypes: readonly string[] = ['LtiResourceLinkRequest'];

/** The claims of a launch that carry each personal field. */
const ltiFieldClaims = {
  name: ['name', 'given_name', 'family_name'],
  email: ['email'],
  picture: ['picture'],
} as const satisfies Record<LtiReleasableField, readonly string[]>;

/** Every claim a launch can carry about the person: the issuer and subject always, the others once released. */
export const ltiClaimsSupported: readonly string[] = ['iss', 'sub', ...Object.values(ltiFieldClaims).flat()];

/** The personal fields whose claims an LTI tool asked for: the most an approval may release. */
export const requestedFields = (claims: readonly string[]): LtiReleasableField[] =>
  ltiReleasableFields.filter((field) => ltiFieldClaims[field].some((claim) => claims.includes(claim)));
