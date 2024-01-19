import { sendError, setCustomData, setNamespace } from '@appsignal/nodejs';
import { swaggerUI } from '@hono/swagger-ui';
import { ZodError } from 'zod';
import authRoutes from './routes/auth';
import middlewares from './routes/middlewares';
import authMiddleware from './routes/middlewares/authMiddleware';
import { customLogger } from './routes/middlewares/customLogger';
import organizationAuthMiddleware from './routes/middlewares/organizationAuthMiddleware';
import organizationsRoutes from './routes/organizations';
import {
  createOrganizationRoute,
  deleteOrganizationRoute,
  deleteUserFromOrganizationRoute,
  getOrganizationByIdOrSlugRoute,
  getOrganizationsRoute,
  getUsersByOrganizationIdRoute,
  inviteUserToOrganizationRoute,
  updateOrganizationRoute,
  updateUserInOrganizationRoute,
} from './routes/organizations/schema';
import otherRoutes from './routes/other';
import { getOrganizationUploadTokenRoute, getPersonalUploadTokenRoute } from './routes/other/schema';
import usersRoutes from './routes/users';
import { deleteUserRoute, getUserByIdOrSlugRoute, getUserMenuRoute, getUsersRoute, meRoute, updateUserRoute } from './routes/users/schema';
import { CustomHono } from './types/common';

export const app = new CustomHono({
  defaultHook: (result, ctx) => {
    if (!result.success && result.error instanceof ZodError) {
      customLogger(
        'Validation error',
        {
          error: result.error.issues[0].message,
          path: result.error.issues[0].path[0],
        },
        'info',
      );

      return ctx.json({ success: false, error: result.error.issues[0].message }, 400);
    }
  },
});

app.route('', middlewares);

const registry = app.openAPIRegistry;

registry.registerComponent('securitySchemes', 'cookieAuth', {
  type: 'apiKey',
  in: 'cookie',
  name: 'auth_session',
  description:
    "Authentication cookie. If you don't have it, you need to sign in or sign up first(/sign-in and /sign-up routes automatically set the cookie).",
});

app.doc31('/openapi.json', {
  info: {
    title: 'Cella API',
    version: 'v1',
    description: 'This is a showcase API documentation built using hono middleware: zod-openapi.',
  },
  openapi: '3.1.0',
  tags: [
    {
      name: 'auth',
      description: 'Authentication',
    },
    {
      name: 'users',
      description: 'Users',
    },
    {
      name: 'organizations',
      description: 'Organizations',
    },
  ],
  security: [
    {
      cookieAuth: [],
    },
  ],
});

app.get(
  '/docs',
  swaggerUI({
    url: 'openapi.json',
  }),
);

// Error handler
app.onError((err, c) => {
  customLogger('Error', { errorMessage: `${err}` }, 'error');

  sendError(err, () => {
    setCustomData({
      requestPath: c.req.path,
      requestMethod: c.req.method,
      errorCode: 500,
    });
    setNamespace('backend');
  });

  return c.json(
    {
      success: false,
      error: 'Something went wrong. Please try again later.',
    },
    500,
  );
});

// authMiddleware() is used for all routes that require authentication
// organizationAuthMiddleware() is used for all routes that require organization membership; it also requires authMiddleware() to be used before and organizationId to be in the path
app[meRoute.method](meRoute.getRoutingPath(), authMiddleware());
app[getUserMenuRoute.method](getUserMenuRoute.getRoutingPath(), authMiddleware());
app[getUsersRoute.method](getUsersRoute.getRoutingPath(), authMiddleware(['ADMIN']));
app[getUserByIdOrSlugRoute.method](getUserByIdOrSlugRoute.getRoutingPath(), authMiddleware());
app[updateUserRoute.method](updateUserRoute.getRoutingPath(), authMiddleware());
app[deleteUserRoute.method](deleteUserRoute.getRoutingPath(), authMiddleware());

app[createOrganizationRoute.method](createOrganizationRoute.getRoutingPath(), authMiddleware(['ADMIN']));
app[getOrganizationsRoute.method](getOrganizationsRoute.getRoutingPath(), authMiddleware());
app[getOrganizationByIdOrSlugRoute.method](getOrganizationByIdOrSlugRoute.getRoutingPath(), authMiddleware(), organizationAuthMiddleware());
app[getUsersByOrganizationIdRoute.method](getUsersByOrganizationIdRoute.getRoutingPath(), authMiddleware(), organizationAuthMiddleware());
app[updateOrganizationRoute.method](updateOrganizationRoute.getRoutingPath(), authMiddleware(), organizationAuthMiddleware(['ADMIN']));
app[deleteOrganizationRoute.method](deleteOrganizationRoute.getRoutingPath(), authMiddleware(['ADMIN']));
app[updateUserInOrganizationRoute.method](updateUserInOrganizationRoute.getRoutingPath(), authMiddleware(), organizationAuthMiddleware(['ADMIN']));
app[inviteUserToOrganizationRoute.method](inviteUserToOrganizationRoute.getRoutingPath(), authMiddleware(), organizationAuthMiddleware(['ADMIN']));
app[deleteUserFromOrganizationRoute.method](
  deleteUserFromOrganizationRoute.getRoutingPath(),
  authMiddleware(),
  organizationAuthMiddleware(['ADMIN']),
);

app[getPersonalUploadTokenRoute.method](getPersonalUploadTokenRoute.getRoutingPath(), authMiddleware());
app[getOrganizationUploadTokenRoute.method](getOrganizationUploadTokenRoute.getRoutingPath(), authMiddleware(), organizationAuthMiddleware());

// routes
const route = app.route('/', authRoutes).route('/', usersRoutes).route('/', organizationsRoutes).route('/', otherRoutes);

export type AppRoute = typeof route;
