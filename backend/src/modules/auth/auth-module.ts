import { defineBackendModule } from '#/lib/module';
import { authGeneralHandlers } from './general/general-handlers';
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
  routes: [
    { path: '/auth/', app: authGeneralHandlers },
    { path: '/auth/', app: authMagicLinkHandlers },
    { path: '/auth/', app: authTotpHandlers },
    { path: '/auth/', app: authPasskeysHandlers },
    { path: '/auth/', app: authOAuthHandlers },
  ],
});
