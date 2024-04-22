import defaultHook from './lib/default-hook';
import docs from './lib/docs';
import { errorResponse } from './lib/errors';
import middlewares from './middlewares';
import authRoutes from './modules/auth';
import generalRoutes from './modules/general';
import organizationsRoutes from './modules/organizations';
import publicRoutes from './modules/public';
import usersRoutes from './modules/users';
import membershipRoutes from './modules/memberships';
import workspaceRoutes from './modules/workspaces';

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
  .route('/', authRoutes)
  .route('/', usersRoutes)
  .route('/', organizationsRoutes)
  .route('/', generalRoutes)
  .route('/', publicRoutes)
  .route('/', membershipRoutes)

  // App-specific routes go here
  .route('/', workspaceRoutes);
