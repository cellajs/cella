import type { SsoClaims } from '#/modules/auth/sso/helpers/federation-client';
import type { Federation } from '#/modules/auth/sso/helpers/federations';
import { displayNameFromEmail, slugFromEmail } from '#/utils/slug';

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
  givenName: string;
  familyName: string;
}

/** The profile the claims assert; without a name, one made from the address stands in, and without an address the subject. */
export const transformSsoClaims = (claims: SsoClaims): SsoProfile => {
  const email = firstString(claims.email)?.toLowerCase();
  const givenName = firstString(claims.given_name) ?? '';
  const familyName = firstString(claims.family_name) ?? '';
  const name = firstString(claims.name) ?? `${givenName} ${familyName}`.trim();
  return { email, givenName, familyName, name: name || (email ? displayNameFromEmail(email) : claims.sub) };
};

/** The account a first sign-in creates: the profile with the slug its address gives. */
export const newUserFromProfile = (profile: SsoProfile & { email: string }) => ({
  email: profile.email,
  name: profile.name,
  slug: slugFromEmail(profile.email),
  givenName: profile.givenName,
  familyName: profile.familyName,
});

/** The snapshot kept on the identity row: the federation's snapshot claims plus the authentication context, when present. */
export const snapshotOf = (federation: Federation, claims: SsoClaims): Record<string, unknown> =>
  Object.fromEntries([...federation.snapshotClaims, 'acr', 'auth_time'].filter((key) => claims[key] !== undefined).map((key) => [key, claims[key]]));
