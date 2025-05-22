import attachmentRouteHandlers from '#/modules/attachments/handlers';
import authRouteHandlers from '#/modules/auth/handlers';
import entityRouteHandlers from '#/modules/entities/handlers';
import meRouteHandlers from '#/modules/me/handlers';
import membershipRouteHandlers from '#/modules/memberships/handlers';
import metricRouteHandlers from '#/modules/metrics/handlers';
import organizationRouteHandlers from '#/modules/organizations/handlers';
import requestRouteHandlers from '#/modules/requests/handlers';
import systemRouteHandlers from '#/modules/system/handlers';
import userRouteHandlers from '#/modules/users/handlers';
import baseApp from './server';

// Define backend routes of your app
const app = baseApp
  .route('/auth', authRouteHandlers)
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
