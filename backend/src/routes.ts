import attachmentsRoutes from '#/modules/attachments';
import authRoutes from '#/modules/auth';
import generalRoutes from '#/modules/general';
import meRoutes from '#/modules/me';
import membershipsRoutes from '#/modules/memberships';
import metricRoutes from '#/modules/metrics';
import organizationsRoutes from '#/modules/organizations';
import requestsRoutes from '#/modules/requests';
import usersRoutes from '#/modules/users';
import baseApp from './server';

// Define backend routes of your app
const app = baseApp
  .route('/auth', authRoutes)
  .route('/me', meRoutes)
  .route('/users', usersRoutes)
  .route('/organizations', organizationsRoutes)
  .route('/', generalRoutes)
  .route('/requests', requestsRoutes)
  .route('/attachments', attachmentsRoutes)
  .route('/metrics', metricRoutes)
  .route('/:orgIdOrSlug/memberships', membershipsRoutes);

// Description of the app-specific modules for the API docs, generated by hono/zod-openapi and scalar/hono-api-reference
export const appModulesList = [];

export default app;
