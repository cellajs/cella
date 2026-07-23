/**
 * Manually defined types for Me module responses.
 * These are separate from schema inference to avoid circular dependencies with mock generators.
 */

import type { EnabledOAuthProvider } from 'shared';
import type { PasskeyModel } from '#/modules/auth/passkeys/passkeys-db';
import type { SessionModel } from '#/modules/auth/sessions-db';
import type { UserModel } from '#/modules/user/user-db';

/** Me response type */
export interface MeResponse {
  user: UserModel;
  isSystemAdmin: boolean;
}

/** Session for auth data response (token already omitted by SessionModel) */
export type MeSession = Omit<SessionModel, 'expiresAt'> & {
  expiresAt: string;
  isCurrent: boolean;
};

/** MeAuthData response type */
export interface MeAuthResponse {
  enabledOAuth: EnabledOAuthProvider[];
  hasTotp: boolean;
  sessions: MeSession[];
  passkeys: PasskeyModel[];
}

/** UploadToken response type */
export interface UploadTokenResponse {
  publicBucket: boolean;
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
