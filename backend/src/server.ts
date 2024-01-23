import defaultHook from './lib/default-hook';
import errorHandler from './lib/error-handler';
import authRoutes from './routes/auth';
import docs from './routes/docs';
import guard from './routes/guard';
import middlewares from './routes/middlewares';
import organizationsRoutes from './routes/organizations';
import otherRoutes from './routes/other';
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

// Error handler
app.onError(errorHandler);

// Set guard middleware
guard(app);

// Add routes for each module
const route = app.route('/', authRoutes).route('/', usersRoutes).route('/', organizationsRoutes).route('/', otherRoutes);

export type AppRoute = typeof route;
