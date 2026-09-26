import { defineBackendModule } from '#/lib/module';
import { authGeneralHandlers } from './general/general-handlers';
import { pruneDevices } from './jobs/prune-devices';
import { reapUnprovenAccounts } from './jobs/reap-unproven-accounts';
import { authMagicLinkHandlers } from './magic/magic-handlers';
import { authOAuthHandlers } from './oauth/oauth-handlers';
import { authPasskeysHandlers } from './passkeys/passkeys-handlers';
import { authTotpHandlers } from './totps/totps-handlers';

defineBackendModule({
  name: 'auth',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  description: `Endpoints for authentication, supporting multiple sign-in methods including OAuth
    (Google, Microsoft, GitHub) and passkeys (WebAuthn). They cover sign-up, sign-in, email verification,
    account linking, and impersonation for system admins.`,
  // Nightly sweeps, staggered around the partition maintenance at 03:15 UTC.
  jobs: [
    { name: 'reap-unproven-accounts', cron: '30 3 * * *', run: () => reapUnprovenAccounts() },
    { name: 'prune-devices', cron: '0 3 * * *', run: () => pruneDevices() },
  ],
  routes: [
    { path: '/auth/', app: authGeneralHandlers },
    { path: '/auth/', app: authMagicLinkHandlers },
    { path: '/auth/', app: authTotpHandlers },
    { path: '/auth/', app: authPasskeysHandlers },
    { path: '/auth/', app: authOAuthHandlers },
  ],
});
