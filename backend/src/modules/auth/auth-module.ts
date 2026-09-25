import { defineBackendModule } from '#/lib/module';
import { authGeneralHandlers } from './general/general-handlers';
import { schedulePruneDevices } from './jobs/prune-devices';
import { scheduleReapUnprovenAccounts } from './jobs/reap-unproven-accounts';
import { authMagicLinkHandlers } from './magic/magic-handlers';
import { authOAuthHandlers } from './oauth/oauth-handlers';
import { authPasskeysHandlers } from './passkeys/passkeys-handlers';
import { authStepUpHandlers } from './step-up/step-up-handlers';
import { authTotpHandlers } from './totps/totps-handlers';

defineBackendModule({
  name: 'auth',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  description: `Endpoints for authentication, supporting multiple sign-in methods including OAuth
    (Google, Microsoft, GitHub) and passkeys (WebAuthn). They cover sign-up, sign-in, email verification,
    account linking, and impersonation for system admins.`,
  // Job ownership (lib/job-ownership.ts) runs these on one instance at a time, so exactly one process reaps and prunes.
  jobs: [
    { name: 'reap-unproven-accounts', start: () => scheduleReapUnprovenAccounts() },
    { name: 'prune-devices', start: () => schedulePruneDevices() },
  ],
  routes: [
    { path: '/auth/', app: authGeneralHandlers },
    { path: '/auth/', app: authMagicLinkHandlers },
    { path: '/auth/', app: authTotpHandlers },
    { path: '/auth/', app: authPasskeysHandlers },
    { path: '/auth/', app: authOAuthHandlers },
    { path: '/auth/', app: authStepUpHandlers },
  ],
});
