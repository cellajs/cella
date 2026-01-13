/**
 * Manually defined types for Me module responses.
 * These are separate from schema inference to avoid circular dependencies with mock generators.
 */

import type { EnabledOAuthProvider } from 'config';
import type { PasskeyModel } from '#/db/schema/passkeys';
import type { SessionModel } from '#/db/schema/sessions';
import type { UserModel } from '#/db/schema/users';

/** Me response type */
export interface MeResponse {
  user: UserModel;
  systemRole: 'admin' | 'user';
}

/** Session for auth data response (expiresAt is serialized to string, token is omitted) */
// TODO look into expiresAt, perhaps we can store it as a string in the DB schema like we do for others.
export type MeSession = Omit<SessionModel, 'token' | 'expiresAt'> & {
  expiresAt: string;
  isCurrent: boolean;
};

/** MeAuthData response type */
export interface MeAuthDataResponse {
  enabledOAuth: EnabledOAuthProvider[];
  hasTotp: boolean;
  hasPassword: boolean;
  sessions: MeSession[];
  passkeys: PasskeyModel[];
}

/** UploadToken response type */
export interface UploadTokenResponse {
  public: boolean;
  sub: string;
  s3: boolean;
  signature: string;
  params: {
    auth: {
      key: string;
      expires?: string;
    };
    [key: string]: unknown;
  };
}
