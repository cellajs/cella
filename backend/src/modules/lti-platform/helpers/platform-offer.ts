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

/** What a launch can tell about the person, from the user as the API serves it: the address only once proven. */
interface PersonalValues {
  name: string;
  givenName: string | null;
  familyName: string | null;
  email: string | null;
  thumbnailUrl: string | null;
}

const claimValues = {
  name: (person) => person.name,
  given_name: (person) => person.givenName,
  family_name: (person) => person.familyName,
  email: (person) => person.email,
  picture: (person) => person.thumbnailUrl,
} satisfies Record<(typeof ltiFieldClaims)[LtiReleasableField][number], (person: PersonalValues) => string | null>;

/**
 * The personal claims of a launch: of each released field, the claims the LTI tool asked for, where the person has a
 * value. None when nothing is released.
 */
export const releasedClaims = (released: readonly LtiReleasableField[], asked: readonly string[], person: PersonalValues): Record<string, string> => {
  const claims: Record<string, string> = {};
  for (const field of released) {
    for (const claim of ltiFieldClaims[field]) {
      const value = asked.includes(claim) ? claimValues[claim](person) : null;
      if (value) claims[claim] = value;
    }
  }
  return claims;
};
