import activityRouteHandlers from '#/modules/activities/activities-handlers';
import attachmentRouteHandlers from '#/modules/attachments/attachments-handlers';
import authGeneralRouteHandlers from '#/modules/auth/general/general-handlers';
import authOAuthRouteHandlers from '#/modules/auth/oauth/oauth-handlers';
import authPasskeysRouteHandlers from '#/modules/auth/passkeys/passkeys-handlers';
import authPasswordsRouteHandlers from '#/modules/auth/passwords/passwords-handlers';
import authTotpRouteHandlers from '#/modules/auth/totps/totps-handlers';
import entityRouteHandlers from '#/modules/entities/entities-handlers';
import meRouteHandlers from '#/modules/me/me-handlers';
import membershipRouteHandlers from '#/modules/memberships/memberships-handlers';
import metricRouteHandlers from '#/modules/metrics/metrics-handlers';
import organizationRouteHandlers from '#/modules/organizations/organizations-handlers';
import pagesRouteHandlers from '#/modules/pages/pages-handlers';
import requestRouteHandlers from '#/modules/requests/requests-handlers';
import syncRouteHandlers from '#/modules/sync/sync-handlers';
import systemRouteHandlers from '#/modules/system/system-handlers';
import userRouteHandlers from '#/modules/users/users-handlers';
import baseApp from '#/server';

// Define backend routes of your app
const app = baseApp
  .route('/activities', activityRouteHandlers)
  .route('/auth/', authGeneralRouteHandlers)
  .route('/auth/', authTotpRouteHandlers)
  .route('/auth/', authPasswordsRouteHandlers)
  .route('/auth/', authPasskeysRouteHandlers)
  .route('/auth/', authOAuthRouteHandlers)
  .route('/me', meRouteHandlers)
  .route('/users', userRouteHandlers)
  .route('/organizations', organizationRouteHandlers)
  .route('/pages', pagesRouteHandlers)
  .route('/entities', entityRouteHandlers)
  .route('/system', systemRouteHandlers)
  .route('/requests', requestRouteHandlers)
  .route('/metrics', metricRouteHandlers)
  .route('/', syncRouteHandlers)
  .route('/:orgIdOrSlug/attachments', attachmentRouteHandlers)
  .route('/:orgIdOrSlug/memberships', membershipRouteHandlers);

export default app;
