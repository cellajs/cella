import { GitHub, Google, MicrosoftEntraId } from 'arctic';
import { config } from 'config';
import { env } from '../../../../env';

export const githubAuth = new GitHub(env.GITHUB_CLIENT_ID || '', env.GITHUB_CLIENT_SECRET || '', `${config.backendAuthUrl}/github/callback`);

export const googleAuth = new Google(env.GOOGLE_CLIENT_ID || '', env.GOOGLE_CLIENT_SECRET || '', `${config.backendAuthUrl}/google/callback`);

export const microsoftAuth = new MicrosoftEntraId(
  env.MICROSOFT_TENANT_ID || '',
  env.MICROSOFT_CLIENT_ID || '',
  env.MICROSOFT_CLIENT_SECRET || '',
  `${config.backendAuthUrl}/microsoft/callback`,
);

export interface githubUserProps {
  avatar_url: string;
  bio: string | null;
  blog: string | null;
  company: string | null;
  created_at: string;
  email: string | null;
  events_url: string;
  followers: number;
  followers_url: string;
  following: number;
  following_url: string;
  gists_url: string;
  gravatar_id: string | null;
  hireable: boolean | null;
  html_url: string;
  id: number;
  location: string | null;
  login: string;
  name: string | null;
  node_id: string;
  organizations_url: string;
  public_gists: number;
  public_repos: number;
  received_events_url: string;
  repos_url: string;
  site_admin: boolean;
  starred_url: string;
  subscriptions_url: string;
  type: string;
  updated_at: string;
  url: string;
}

export interface githubUserEmailProps {
  email: string;
  primary: boolean;
  verified: boolean;
  visibility: string | null;
}

export interface googleUserProps {
  sub: string;
  name: string;
  given_name: string;
  family_name: string;
  picture: string;
  email: string;
  email_verified: boolean;
  locale: string;
}

export interface microsoftUserProps {
  sub: string;
  name: string;
  given_name: string;
  family_name: string;
  picture: string;
  email: string | undefined;
}
