import type { AuthStrategy } from '#/modules/auth/sessions-db';

/** Sign-in methods as people read them; a provider identity's issuer is its strategy slug. */
export const strategyLabels: Record<AuthStrategy, string> = {
  passkey: 'Passkey',
  totp: 'Authenticator app',
  github: 'GitHub',
  google: 'Google',
  microsoft: 'Microsoft',
  magic: 'Magic link',
  email: 'Email',
};
