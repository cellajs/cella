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
  anonymous: 'Anonymous',
};

const federationLabels = Object.fromEntries(Object.entries(appConfig.federations).map(([key, federation]) => [key, federation.name]));

/** Sign-in methods as people read them; an identity's provider is its strategy slug, a federation's label its config name. */
export const strategyLabels = { ...builtInLabels, ...federationLabels } as Record<AuthStrategy, string>;
