import { defineBackendModule } from '#/lib/module';
import { authAccountHandlers } from '#/modules/auth/account/account-handlers';
import { authGeneralHandlers } from '#/modules/auth/core/general/general-handlers';
import { authLtiHandlers, ltiContextHandlers } from '#/modules/auth/flows/lti/lti-handlers';
import { ltiMemberImportQueue } from '#/modules/auth/flows/lti/operations/import-lti-members';
import { rotateLtiConnectionKeys } from '#/modules/auth/flows/lti/operations/rotate-lti-connection-keys';
import { authMagicLinkHandlers } from '#/modules/auth/flows/magic/magic-handlers';
import { authOAuthHandlers } from '#/modules/auth/flows/oauth/oauth-handlers';
import { authPasskeysHandlers } from '#/modules/auth/flows/passkeys/passkeys-handlers';
import { authSsoHandlers } from '#/modules/auth/flows/sso/sso-handlers';
import { authStepUpHandlers } from '#/modules/auth/flows/step-up/step-up-handlers';
import { authTotpsHandlers } from '#/modules/auth/flows/totps/totps-handlers';

defineBackendModule({
  name: 'auth',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  description: `Endpoints for authentication, supporting sign-in by magic link, passkey (WebAuthn), OAuth (Google,
    Microsoft, GitHub) and institutional SSO through a federation (SURFconext), with TOTP as a second factor. They cover
    sign-up, sign-in, MFA, step-up, email verification and account linking. As an LTI tool the app registers at an LTI
    platform by Dynamic Registration, imports a course's people from a platform built on the template, lists each
    course with how its last import ran for an organization admin, and rotates each connection's key.`,
  // Daily: the steps of a rotation are days apart.
  jobs: [{ name: 'lti.rotate-connection-keys', cron: '40 4 * * *', run: () => rotateLtiConnectionKeys() }],
  routes: [
    { path: '/auth/', app: authGeneralHandlers },
    { path: '/auth/', app: authAccountHandlers },
    { path: '/auth/', app: authMagicLinkHandlers },
    { path: '/auth/', app: authTotpsHandlers },
    { path: '/auth/', app: authPasskeysHandlers },
    { path: '/auth/', app: authOAuthHandlers },
    { path: '/auth/', app: authSsoHandlers },
    { path: '/auth/', app: authLtiHandlers },
    { path: '/auth/', app: authStepUpHandlers },
    { path: '/tenants/:tenantId/organizations/:organizationId/lti-contexts', app: ltiContextHandlers },
  ],
  queues: [ltiMemberImportQueue],
});
