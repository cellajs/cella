import defaultHook from './lib/default-hook';
import errorHandler from './lib/error-handler';
import authRoutes from './routes/auth';
import docs from './routes/docs';
import generalRoutes from './routes/general';
import guard from './routes/guard';
import middlewares from './routes/middlewares';
import { customLogger } from './routes/middlewares/custom-logger';
import organizationsRoutes from './routes/organizations';
import usersRoutes from './routes/users';
import { CustomHono } from './types/common';

// Set default hook to catch validation errors
export const app = new CustomHono({
  defaultHook,
});

// Add middleware
app.route('', middlewares);

// Generate OpenAPI Docs
docs(app);

// Not found handler
app.notFound((ctx) => {
  customLogger('Error', { errorMessage: 'Not found', errorCode: 404 }, 'warn');

  return ctx.json({ success: false, error: 'Not found' }, 404);
});

// Error handler
app.onError(errorHandler);

// Set guard middleware
guard(app);

// Add routes for each module
const route = app.route('/', authRoutes).route('/', usersRoutes).route('/', organizationsRoutes).route('/', generalRoutes);

export type AppRoute = typeof route;
