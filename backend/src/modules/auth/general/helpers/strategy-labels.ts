import { appConfig } from 'shared';
import type { AuthStrategy } from '#/modules/auth/sessions/sessions-db';

const builtInLabels = {
  passkey: 'Passkey',
  totp: 'Authenticator app',
  github: 'GitHub',
  google: 'Google',
  microsoft: 'Microsoft',
  magic: 'Magic link',
  email: 'Email',
};

const federationLabels = Object.fromEntries(Object.entries(appConfig.federations).map(([key, federation]) => [key, federation.label]));

/** Sign-in methods as people read them; a provider identity's issuer is its strategy slug, a federation's its config label. */
export const strategyLabels = { ...builtInLabels, ...federationLabels } as Record<AuthStrategy, string>;
