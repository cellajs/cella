import slugify from 'slugify';
import { slugFromEmail } from '#/utils/slug-from-email';
import type { GithubUserEmailProps, GithubUserProps, GoogleUserProps, MicrosoftUserProps } from './oauth-providers';

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

/**
 * Transform social media user data (Google or Microsoft) into a standardized user object.
 * This helper formats the data received from the OAuth provider into a uniform user object.
 *
 * @param user - User data from OAuth provider (Google or Microsoft).
 * @returns  - Formatted user object.
 * @throws - If no email is found in user data.
 */
export const transformSocialUserData = (user: GoogleUserProps | MicrosoftUserProps): TransformedUser => {
  if (!user.email) throw new Error('no_email_found');

  const email = user.email.toLowerCase();

  return {
    id: user.sub,
    slug: slugFromEmail(email),
    email,
    name: user.name,
    emailVerified: 'email_verified' in user ? user.email_verified : false,
    thumbnailUrl: user.picture,
    firstName: user.given_name,
    lastName: user.family_name,
  };
};

/**
 * Transform GitHub user data into a standardized user object.
 * This helper formats the data received from GitHub and fetches the user's primary email.
 *
 * @param user - User data from GitHub.
 * @param emails - List of emails associated with GitHub user.
 * @returns - Formatted user object.
 * @throws - If no email is found in user data.
 */
export const transformGithubUserData = (user: GithubUserProps, emails: GithubUserEmailProps[]): TransformedUser => {
  const primaryEmail = emails.find((email) => email.primary);
  if (!primaryEmail) throw new Error('no_email_found');

  const email = primaryEmail.email.toLowerCase();
  const slug = slugify(user.login, { lower: true, strict: true });
  const { firstName, lastName } = splitFullName(user.name || slug);

  return {
    id: String(user.id),
    slug,
    email,
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
