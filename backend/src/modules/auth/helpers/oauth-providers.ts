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
