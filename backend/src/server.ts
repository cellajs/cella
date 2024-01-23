import authRoutes from './routes/auth';
import middlewares from './routes/middlewares';
import organizationsRoutes from './routes/organizations';
import otherRoutes from './routes/other';
import usersRoutes from './routes/users';
import { CustomHono } from './types/common';
import docs from './routes/docs';
import defaultHook from './lib/defaultHook';
import errorHandler from './lib/errorHandler';
import guard from './routes/guard';

export const app = new CustomHono({
  defaultHook,
});

app.route('', middlewares);

// docs
docs(app);

// Error handler
app.onError(errorHandler);

// guard
guard(app);

// routes
const route = app.route('/', authRoutes).route('/', usersRoutes).route('/', organizationsRoutes).route('/', otherRoutes);

export type AppRoute = typeof route;
