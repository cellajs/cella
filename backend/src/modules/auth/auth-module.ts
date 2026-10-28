import { defineBackendModule } from '#/lib/module';
import { authGeneralHandlers } from '#/modules/auth/general/general-handlers';
import { authMagicLinkHandlers } from '#/modules/auth/magic/magic-handlers';
import { authOAuthHandlers } from '#/modules/auth/oauth/oauth-handlers';
import { authPasskeysHandlers } from '#/modules/auth/passkeys/passkeys-handlers';
import { authSsoHandlers } from '#/modules/auth/sso/sso-handlers';
import { authStepUpHandlers } from '#/modules/auth/step-up/step-up-handlers';
import { authTotpsHandlers } from '#/modules/auth/totps/totps-handlers';

defineBackendModule({
  name: 'auth',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  description: `Endpoints for authentication, supporting sign-in by magic link, passkey (WebAuthn), OAuth (Google,
    Microsoft, GitHub) and institutional SSO through a federation (SURFconext), with TOTP as a second factor. They cover
    sign-up, sign-in, MFA, step-up, email verification, account linking, and impersonation for system admins.`,
  routes: [
    { path: '/auth/', app: authGeneralHandlers },
    { path: '/auth/', app: authMagicLinkHandlers },
    { path: '/auth/', app: authTotpsHandlers },
    { path: '/auth/', app: authPasskeysHandlers },
    { path: '/auth/', app: authOAuthHandlers },
    { path: '/auth/', app: authSsoHandlers },
    { path: '/auth/', app: authStepUpHandlers },
  ],
});
