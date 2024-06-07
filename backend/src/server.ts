import defaultHook from './lib/default-hook';
import docs from './lib/docs';
import { errorResponse } from './lib/errors';
import middlewares from './middlewares';
import authRoutes from './modules/auth';
import generalRoutes from './modules/general';
import meRoutes from './modules/me';
import MembershipsRoutes from './modules/memberships';
import organizationsRoutes from './modules/organizations';
import projectsRoutes from './modules/projects';
import requestsRoutes from './modules/requests';
import usersRoutes from './modules/users';
import workspacesRoutes from './modules/workspaces';

import { CustomHono } from './types/common';

// Set default hook to catch validation errors
export const app = new CustomHono({
  defaultHook,
});

// Add global middleware
app.route('', middlewares);

// Init OpenAPI docs
docs(app);

// Not found handler
app.notFound((ctx) => {
  // t('common:error.route_not_found.text')
  return errorResponse(ctx, 404, 'route_not_found', 'warn', undefined, { path: ctx.req.path });
});

// Error handler
app.onError((err, ctx) => {
  // t('common:error.server_error.text')
  return errorResponse(ctx, 500, 'server_error', 'error', undefined, {}, err);
});

// Add routes for each module
app
  .route('/me', meRoutes)
  .route('/users', usersRoutes)
  .route('/memberships', MembershipsRoutes)
  .route('/organizations', organizationsRoutes)
  .route('/requests', requestsRoutes)
  .route('/', authRoutes)
  .route('/', generalRoutes)

  // App-specific routes go here
  .route('/workspaces', workspacesRoutes)
  .route('/projects', projectsRoutes);
