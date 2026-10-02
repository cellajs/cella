import { slugFromEmail } from '#/utils/slug-from-email';
import type { SsoClaims } from './federation-client';
import type { Federation } from './federations';

/** The first string of a claim that may be a string or an array of strings; undefined when absent or empty. */
const firstString = (value: unknown): string | undefined => {
  const candidate = Array.isArray(value) ? value[0] : value;
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : undefined;
};

/** The asserted institution: the federation's tenant claim, lower case (RFC 1035 domains compare case-insensitively). */
export const assertedInstitution = (federation: Federation, claims: SsoClaims): string | undefined =>
  firstString(claims[federation.tenantClaim])?.toLowerCase();

/** The profile a sign-in asserts. `email` is undefined when the institution released none: a new account needs it, a returning identity does not. */
export interface SsoProfile {
  subject: string;
  email?: string;
  name: string;
  firstName: string;
  lastName: string;
}

export const transformSsoClaims = (claims: SsoClaims): SsoProfile => {
  const email = firstString(claims.email)?.toLowerCase();
  const firstName = firstString(claims.given_name) ?? '';
  const lastName = firstString(claims.family_name) ?? '';
  const name = firstString(claims.name) ?? `${firstName} ${lastName}`.trim();
  return { subject: claims.sub, email, firstName, lastName, name: name || (email ? slugFromEmail(email) : claims.sub) };
};

/** The account a first sign-in creates: the profile with the slug its address gives. */
export const newUserFromProfile = (profile: SsoProfile & { email: string }) => ({
  email: profile.email,
  name: profile.name,
  slug: slugFromEmail(profile.email),
  firstName: profile.firstName,
  lastName: profile.lastName,
});

/** The snapshot kept on the identity row: the federation's snapshot claims plus the authentication context, when present. */
export const snapshotOf = (federation: Federation, claims: SsoClaims): Record<string, unknown> =>
  Object.fromEntries([...federation.snapshotClaims, 'acr', 'auth_time'].filter((key) => claims[key] !== undefined).map((key) => [key, claims[key]]));
