import { DrizzlePostgreSQLAdapter } from '@lucia-auth/adapter-drizzle';
import { GitHub, Google, MicrosoftEntraId } from 'arctic';
import { config } from 'config';
import { Lucia, TimeSpan } from 'lucia';

import { env } from 'env';
import { githubSignInCallbackRoute, googleSignInCallbackRoute, microsoftSignInCallbackRoute } from '../routes/auth/schema';
import { db } from './db';
import { UserModel, sessionsTable, usersTable } from './schema';

export const githubAuth = new GitHub(env.GITHUB_CLIENT_ID || '', env.GITHUB_CLIENT_SECRET || '', {
  redirectURI: `${config.backendUrl}${githubSignInCallbackRoute.path}`,
});
export const googleAuth = new Google(
  env.GOOGLE_CLIENT_ID || '',
  env.GOOGLE_CLIENT_SECRET || '',
  `${config.backendUrl}${googleSignInCallbackRoute.path}`,
);
export const microsoftAuth = new MicrosoftEntraId(
  env.MICROSOFT_TENANT_ID || '',
  env.MICROSOFT_CLIENT_ID || '',
  env.MICROSOFT_CLIENT_SECRET || '',
  `${config.backendUrl}${microsoftSignInCallbackRoute.path}`,
);

const adapter = new DrizzlePostgreSQLAdapter(db, sessionsTable, usersTable);

export const auth = new Lucia(adapter, {
  sessionExpiresIn: new TimeSpan(4, 'w'), // 4 weeks
  sessionCookie: {
    name: `${config.slug}-session`,
    expires: true,
    attributes: {
      secure: config.mode === 'production',
      sameSite: 'lax',
    },
  },
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
