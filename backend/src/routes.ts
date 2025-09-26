import attachmentRouteHandlers from '#/modules/attachments/handlers';
import authGeneralRouteHandlers from '#/modules/auth/general/handlers';
import authOAuthRouteHandlers from '#/modules/auth/oauth/handlers';
import authPasskeysRouteHandlers from '#/modules/auth/passkeys/handlers';
import authTotpRouteHandlers from '#/modules/auth/totps/handlers';
import entityRouteHandlers from '#/modules/entities/handlers';
import meRouteHandlers from '#/modules/me/handlers';
import membershipRouteHandlers from '#/modules/memberships/handlers';
import metricRouteHandlers from '#/modules/metrics/handlers';
import organizationRouteHandlers from '#/modules/organizations/handlers';
import requestRouteHandlers from '#/modules/requests/handlers';
import systemRouteHandlers from '#/modules/system/handlers';
import userRouteHandlers from '#/modules/users/handlers';
import baseApp from '#/server';
import authPasswordsRouteHandlers from './modules/auth/passwords/handlers';

// Define backend routes of your app
const app = baseApp
  .route('/auth/', authGeneralRouteHandlers)
  .route('/auth/', authTotpRouteHandlers)
  .route('/auth/', authPasswordsRouteHandlers)
  .route('/auth/', authPasskeysRouteHandlers)
  .route('/auth/', authOAuthRouteHandlers)
  .route('/me', meRouteHandlers)
  .route('/users', userRouteHandlers)
  .route('/organizations', organizationRouteHandlers)
  .route('/entities', entityRouteHandlers)
  .route('/system', systemRouteHandlers)
  .route('/requests', requestRouteHandlers)
  .route('/metrics', metricRouteHandlers)
  .route('/:orgIdOrSlug/attachments', attachmentRouteHandlers)
  .route('/:orgIdOrSlug/memberships', membershipRouteHandlers);

export default app;
