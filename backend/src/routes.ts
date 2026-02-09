import activitiesRouteHandlers from '#/modules/activities/activities-handlers';
import attachmentRouteHandlers from '#/modules/attachment/attachment-handlers';
import authGeneralRouteHandlers from '#/modules/auth/general/general-handlers';
import authOAuthRouteHandlers from '#/modules/auth/oauth/oauth-handlers';
import authPasskeysRouteHandlers from '#/modules/auth/passkeys/passkeys-handlers';
import authPasswordsRouteHandlers from '#/modules/auth/passwords/passwords-handlers';
import authTotpRouteHandlers from '#/modules/auth/totps/totps-handlers';
import entitiesRouteHandlers from '#/modules/entities/entities-handlers';
import meRouteHandlers from '#/modules/me/me-handlers';
import membershipsRouteHandlers from '#/modules/memberships/memberships-handlers';
import metricsRouteHandlers from '#/modules/metrics/metrics-handlers';
import organizationRouteHandlers from '#/modules/organization/organization-handlers';
import pageRouteHandlers from '#/modules/page/page-handlers';
import requestsRouteHandlers from '#/modules/requests/requests-handlers';
import systemRouteHandlers from '#/modules/system/system-handlers';
import tenantRouteHandlers from '#/modules/tenants/tenants-handlers';
import userRouteHandlers from '#/modules/user/user-handlers';
import baseApp from '#/server';

// Define backend routes of your app
const app = baseApp
  .route('/activities', activitiesRouteHandlers)
  .route('/auth/', authGeneralRouteHandlers)
  .route('/auth/', authTotpRouteHandlers)
  .route('/auth/', authPasswordsRouteHandlers)
  .route('/auth/', authPasskeysRouteHandlers)
  .route('/auth/', authOAuthRouteHandlers)
  .route('/me', meRouteHandlers)
  .route('/organizations', organizationRouteHandlers)
  .route('/pages', pageRouteHandlers)
  .route('/entities', entitiesRouteHandlers)
  .route('/system', systemRouteHandlers)
  .route('/tenants', tenantRouteHandlers)
  .route('/requests', requestsRouteHandlers)
  .route('/metrics', metricsRouteHandlers)
  // Tenant-scoped routes: /:tenantId/:orgIdOrSlug/...
  .route('/:tenantId/:orgIdOrSlug/users', userRouteHandlers)
  .route('/:tenantId/:orgIdOrSlug/attachments', attachmentRouteHandlers)
  .route('/:tenantId/:orgIdOrSlug/memberships', membershipsRouteHandlers);

export default app;
