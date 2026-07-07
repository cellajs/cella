import { appConfig } from 'shared';
import { attachmentHandlers } from '#/modules/attachment/attachment-handlers';
import { authGeneralHandlers } from '#/modules/auth/general/general-handlers';
import { authMagicLinkHandlers } from '#/modules/auth/magic/magic-handlers';
import { authOAuthHandlers } from '#/modules/auth/oauth/oauth-handlers';
import { authPasskeysHandlers } from '#/modules/auth/passkeys/passkeys-handlers';
import { authTotpHandlers } from '#/modules/auth/totps/totps-handlers';
import { domainHandlers } from '#/modules/domains/domains-handlers';
import { entityHandlers } from '#/modules/entities/entities-handlers';
import { mcpHandlers } from '#/modules/mcp/mcp-handlers';
import { meHandlers } from '#/modules/me/me-handlers';
import { membershipHandlers } from '#/modules/memberships/memberships-handlers';
import { metricHandlers } from '#/modules/metrics/metrics-handlers';
import { organizationHandlers } from '#/modules/organization/organization-handlers';
import { requestHandlers } from '#/modules/requests/requests-handlers';
import { seenHandlers, unseenHandlers } from '#/modules/seen/seen-handlers';
import { systemHandlers } from '#/modules/system/system-handlers';
import { tenantHandlers } from '#/modules/tenants/tenants-handlers';
import { userHandlers } from '#/modules/user/user-handlers';
import { yjsHandlers } from '#/modules/yjs/yjs-handlers';
import { baseApp } from '#/server';
import { emailPreviewHandlers } from '../emails/preview-route';

// Define backend routes of your app
baseApp.route('/auth/', authGeneralHandlers);
baseApp.route('/auth/', authMagicLinkHandlers);
baseApp.route('/auth/', authTotpHandlers);
baseApp.route('/auth/', authPasskeysHandlers);
baseApp.route('/auth/', authOAuthHandlers);

baseApp.route('/me', meHandlers);
baseApp.route('/unseen', unseenHandlers);
baseApp.route('/entities', entityHandlers);
baseApp.route('/system', systemHandlers);

baseApp.route('/tenants', tenantHandlers);
baseApp.route('/tenants/:tenantId/domains', domainHandlers);

baseApp.route('/requests', requestHandlers);
baseApp.route('/metrics', metricHandlers);
baseApp.route('/users', userHandlers);

baseApp.route('/yjs', yjsHandlers);

// Modules with absolute route paths: cross-tenant list + tenant-scoped routes in one app.
// Registered after all static mounts so param segments (/:tenantId/...) cannot shadow static paths.
baseApp.route('/', organizationHandlers);

// Tenant-scoped routes: /:tenantId/:organizationId/...
baseApp.route('/:tenantId/:organizationId/mcp', mcpHandlers);
baseApp.route('/:tenantId/:organizationId/attachments', attachmentHandlers);
baseApp.route('/:tenantId/:organizationId/memberships', membershipHandlers);
baseApp.route('/:tenantId/:organizationId/seen', seenHandlers);

// Dev-only email preview (local authoring + Storybook email stories)
if (appConfig.mode !== 'production') baseApp.route('/dev/emails', emailPreviewHandlers);

export { baseApp };
