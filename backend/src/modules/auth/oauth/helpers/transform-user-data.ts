import slugify from 'slugify';
import type {
  GithubUserEmailProps,
  GithubUserProps,
  GoogleUserProps,
  MicrosoftUserProps,
} from '#/modules/auth/oauth/helpers/providers';
import { slugFromEmail } from '#/utils/slug-from-email';

export type TransformedUser = {
  id: string;
  slug: string;
  email: string;
  name: string;
  emailVerified: boolean;
  thumbnailUrl: string;
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
    name: name,
    emailVerified: 'email_verified' in user ? user.email_verified : false,
    thumbnailUrl: user.picture,
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
    thumbnailUrl: user.avatar_url,
    firstName,
    lastName,
  };
};

// Split full name into first and last name
const splitFullName = (name: string) => {
  const [firstName, lastName] = name.split(' ');
  return { firstName: firstName || '', lastName: lastName || '' };
};
