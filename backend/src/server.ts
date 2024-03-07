import defaultHook from './lib/default-hook';
import docs from './lib/docs';
import { errorResponse } from './lib/errors';
import middlewares from './middlewares';
import authRoutes from './modules/auth';
import generalRoutes from './modules/general';
import organizationsRoutes from './modules/organizations';
import publicRoutes from './modules/public';
import usersRoutes from './modules/users';
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
  return errorResponse(ctx, 404, 'route_not_found', 'warn', true);
});

// Error handler
app.onError((err, ctx) => {
  return errorResponse(ctx, 500, 'server_error', 'error', true, {}, err);
});

// Add routes for each module
const route = app.route('/', authRoutes).route('/', usersRoutes).route('/', organizationsRoutes).route('/', generalRoutes).route('/', publicRoutes);

// Export type to share API with Client (RP)
export type AppRoute = typeof route;
