import attachmentsRoutes from '#/modules/attachments/handlers';
import authRoutes from '#/modules/auth/handlers';
import entitiesRoutes from '#/modules/entities/handlers';
import meRoutes from '#/modules/me/handlers';
import membershipsRoutes from '#/modules/memberships/handlers';
import metricRoutes from '#/modules/metrics/handlers';
import organizationsRoutes from '#/modules/organizations/handlers';
import requestsRoutes from '#/modules/requests/handlers';
import systemRoutes from '#/modules/system/handlers';
import usersRoutes from '#/modules/users/handlers';
import baseApp from './server';

// Define backend routes of your app
const app = baseApp
  .route('/auth', authRoutes)
  .route('/me', meRoutes)
  .route('/users', usersRoutes)
  .route('/organizations', organizationsRoutes)
  .route('/entities', entitiesRoutes)
  .route('/system', systemRoutes)
  .route('/requests', requestsRoutes)
  .route('/metrics', metricRoutes)
  .route('/:orgIdOrSlug/attachments', attachmentsRoutes)
  .route('/:orgIdOrSlug/memberships', membershipsRoutes);

export default app;
