import type { SsoClaims } from '#/modules/auth/sso/helpers/federation-client';
import type { Federation } from '#/modules/auth/sso/helpers/federations';
import { slugFromEmail } from '#/utils/slug';

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
  email?: string;
  name: string;
  firstName: string;
  lastName: string;
}

/** The profile the claims assert; without a name, the address's slug stands in, and without an address the subject. */
export const transformSsoClaims = (claims: SsoClaims): SsoProfile => {
  const email = firstString(claims.email)?.toLowerCase();
  const firstName = firstString(claims.given_name) ?? '';
  const lastName = firstString(claims.family_name) ?? '';
  const name = firstString(claims.name) ?? `${firstName} ${lastName}`.trim();
  return { email, firstName, lastName, name: name || (email ? slugFromEmail(email) : claims.sub) };
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
