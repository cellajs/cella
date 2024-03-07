import { DrizzlePostgreSQLAdapter } from '@lucia-auth/adapter-drizzle';
import { GitHub, Google, MicrosoftEntraId } from 'arctic';
import { config } from 'config';
import { Lucia, SessionCookieOptions, TimeSpan } from 'lucia';

import { env } from 'env';
import { githubSignInCallbackRouteConfig, googleSignInCallbackRouteConfig, microsoftSignInCallbackRouteConfig } from '../modules/auth/routes';
import { db } from './db';
import { sessionsTable } from './schema/sessions';
import { UserModel, usersTable } from './schema/users';

export const githubAuth = new GitHub(env.GITHUB_CLIENT_ID || '', env.GITHUB_CLIENT_SECRET || '', {
  redirectURI: `${config.backendUrl}${githubSignInCallbackRouteConfig.route.path}`,
});

export const googleAuth = new Google(
  env.GOOGLE_CLIENT_ID || '',
  env.GOOGLE_CLIENT_SECRET || '',
  `${config.backendUrl}${googleSignInCallbackRouteConfig.route.path}`,
);

export const microsoftAuth = new MicrosoftEntraId(
  env.MICROSOFT_TENANT_ID || '',
  env.MICROSOFT_CLIENT_ID || '',
  env.MICROSOFT_CLIENT_SECRET || '',
  `${config.backendUrl}${microsoftSignInCallbackRouteConfig.route.path}`,
);

// Create Lucia adapter instance
const adapter = new DrizzlePostgreSQLAdapter(db, sessionsTable, usersTable);
const isProduction = config.mode === 'production';

const sessionCookieOptions: SessionCookieOptions = {
  name: `${config.slug}-session-v1`,
  expires: true,
  attributes: {
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
  },
};

export const auth = new Lucia(adapter, {
  sessionExpiresIn: new TimeSpan(4, 'w'), // Set session expiration to 4 weeks
  sessionCookie: sessionCookieOptions,
  getUserAttributes({ hashedPassword, ...databaseUserAttributes }) {
    return databaseUserAttributes;
  },
});

export type Auth = typeof auth;

declare module 'lucia' {
  interface Register {
    Lucia: typeof auth;
    DatabaseUserAttributes: UserModel;
  }
}
