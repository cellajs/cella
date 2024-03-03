import configureRoutes from './configure';
import { customLogger } from './lib/custom-logger';
import defaultHook from './lib/default-hook';
import docs from './lib/docs';
import errorHandler from './lib/error-handler';
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
  const data = {
    requestPath: ctx.req.path,
    requestMethod: ctx.req.method,
    error: 'Not found',
    errorCode: 404,
  };

  customLogger('Error', data, 'warn');

  return ctx.json({ success: false, error: 'Not found' }, 404);
});

// Error handler
app.onError(errorHandler);

// Configure routes with their specific middleware
configureRoutes(app);

// Add routes for each module
const route = app.route('/', authRoutes).route('/', usersRoutes).route('/', organizationsRoutes).route('/', generalRoutes).route('/', publicRoutes);

// Export type to share API with Client (RP)
export type AppRoute = typeof route;
