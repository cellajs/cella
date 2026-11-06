import slugify from 'slugify';
import type { GithubUserEmailProps, GithubUserProps, GoogleUserProps, MicrosoftUserProps } from '#/modules/auth/oauth/helpers/providers';
import { slugFromEmail } from '#/utils/slug';

/** A provider's profile in the shape a sign-up or connect reads; the address is lower-cased and trimmed. */
export type TransformedUser = {
  id: string;
  slug: string;
  email: string;
  /** Set when the provider hosts the address's mailbox, so its sign-in proves the inbox: a verified flag records a check made once. */
  provesAddress?: boolean;
  name: string;
  emailVerified: boolean;
  firstName: string;
  lastName: string;
};

/** Normalizes Google/Microsoft OAuth profile data into a `TransformedUser`. Throws if no email. */
export const transformSocialUserData = (user: GoogleUserProps | MicrosoftUserProps): TransformedUser => {
  if (!user.email) throw new Error('no_email_found');

  const normalizedEmail = user.email.toLowerCase().trim();

  const givenName = 'given_name' in user ? user.given_name : user.givenname || '';
  const familyName = 'family_name' in user ? user.family_name : user.familyname || '';
  const name = user.name || `${givenName} ${familyName}`.trim();

  return {
    id: user.sub,
    slug: slugFromEmail(normalizedEmail),
    email: normalizedEmail,
    // Google hosts Gmail and Workspace (`hd`) mailboxes; for any other address its flag dates from the account's creation.
    provesAddress: 'email_verified' in user && user.email_verified && (normalizedEmail.endsWith('@gmail.com') || !!user.hd),
    name,
    emailVerified: 'email_verified' in user ? user.email_verified : false,
    firstName: givenName,
    lastName: familyName,
  };
};

/** Normalizes GitHub profile data (and its email list) into a `TransformedUser`. Throws if no primary email. */
export const transformGithubUserData = (user: GithubUserProps, emails: GithubUserEmailProps[]): TransformedUser => {
  const primaryEmail = emails.find((email) => email.primary);
  if (!primaryEmail) throw new Error('no_email_found');

  const normalizedEmail = primaryEmail.email.toLowerCase().trim();
  const slug = slugify(user.login, { lower: true, strict: true });
  const { firstName, lastName } = splitFullName(user.name || slug);

  return {
    id: String(user.id),
    slug,
    email: normalizedEmail,
    name: user.name || user.login,
    emailVerified: primaryEmail.verified,
    firstName,
    lastName,
  };
};

/** GitHub has one name string: the first word is the given name, everything after it the family name ("de Vries"). */
const splitFullName = (name: string) => {
  const [firstName = '', ...rest] = name.trim().split(/\s+/);
  return { firstName, lastName: rest.join(' ') };
};
