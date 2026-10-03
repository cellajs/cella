/** Separate from schema inference to avoid circular dependencies with mock generators. */

import type { EnabledOAuthProvider } from 'shared';
import type { PasskeyModel } from '#/modules/auth/passkeys/passkeys-db';
import type { SessionModel } from '#/modules/auth/sessions/sessions-db';
import type { UserMinimalBase } from '#/modules/user/helpers/audit-user';
import type { UserModel } from '#/modules/user/user-db';

export interface MeResponse {
  user: UserModel;
  isSystemAdmin: boolean;
  impersonator: UserMinimalBase | null;
}

/** Session for auth data response (token already omitted by SessionModel) */
export type MeSession = Omit<SessionModel, 'expiresAt'> & { expiresAt: string; isCurrent: boolean; isNewDevice: boolean };

export interface MeAuthResponse {
  enabledOAuth: EnabledOAuthProvider[];
  hasTotp: boolean;
  sessions: MeSession[];
  passkeys: PasskeyModel[];
}

export interface UploadTokenResponse {
  publicBucket: boolean;
  sub: string;
  s3: boolean;
  signature: string;
  params: { auth: { key: string; expires?: string }; [key: string]: unknown };
}
