import { CustomHono } from '../types/common';

import { createRoute } from '@hono/zod-openapi';
import { MiddlewareHandler } from 'hono';
import authMiddleware from './middlewares/auth-middleware';
import organizationAuthMiddleware from './middlewares/organization-auth-middleware';
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
} from './organizations/schema';
import { getOrganizationUploadTokenRoute, getPersonalUploadTokenRoute } from './other/schema';
import { deleteUserRoute, getUserByIdOrSlugRoute, getUserMenuRoute, getUsersRoute, meRoute, updateUserRoute } from './users/schema';
import { rateLimiter, signInRateLimiter } from './middlewares/rate-limiter';
import { signInRoute } from './auth/schema';

// authMiddleware() is used for all routes that require authentication
// organizationAuthMiddleware() is used for all routes that require organization membership; it also requires authMiddleware() to be used before and organizationId to be in the path
const routesMiddlewares: {
  route: ReturnType<typeof createRoute>;
  middlewares: MiddlewareHandler[];
}[] = [
  {
    route: signInRoute,
    middlewares: [signInRateLimiter()],
  },
  {
    route: meRoute,
    middlewares: [authMiddleware()],
  },
  {
    route: getUserMenuRoute,
    middlewares: [authMiddleware()],
  },
  {
    route: getUsersRoute,
    middlewares: [authMiddleware(['ADMIN'])],
  },
  {
    route: getUserByIdOrSlugRoute,
    middlewares: [authMiddleware()],
  },
  {
    route: updateUserRoute,
    middlewares: [authMiddleware()],
  },
  {
    route: deleteUserRoute,
    middlewares: [authMiddleware()],
  },
  {
    route: createOrganizationRoute,
    middlewares: [authMiddleware(['ADMIN'])],
  },
  {
    route: getOrganizationsRoute,
    middlewares: [
      authMiddleware(),
      rateLimiter({
        points: 1,
        duration: 60,
      }),
    ],
  },
  {
    route: getOrganizationByIdOrSlugRoute,
    middlewares: [authMiddleware(), organizationAuthMiddleware()],
  },
  {
    route: getUsersByOrganizationIdRoute,
    middlewares: [authMiddleware(), organizationAuthMiddleware()],
  },
  {
    route: updateOrganizationRoute,
    middlewares: [authMiddleware(), organizationAuthMiddleware(['ADMIN'])],
  },
  {
    route: deleteOrganizationRoute,
    middlewares: [authMiddleware(['ADMIN'])],
  },
  {
    route: updateUserInOrganizationRoute,
    middlewares: [authMiddleware(), organizationAuthMiddleware(['ADMIN'])],
  },
  {
    route: inviteUserToOrganizationRoute,
    middlewares: [authMiddleware(), organizationAuthMiddleware(['ADMIN'])],
  },
  {
    route: deleteUserFromOrganizationRoute,
    middlewares: [authMiddleware(), organizationAuthMiddleware(['ADMIN'])],
  },
  {
    route: getPersonalUploadTokenRoute,
    middlewares: [authMiddleware()],
  },
  {
    route: getOrganizationUploadTokenRoute,
    middlewares: [authMiddleware(), organizationAuthMiddleware()],
  },
];

const guard = (app: CustomHono) => {
  for (const { route, middlewares } of routesMiddlewares) {
    app[route.method as 'get' | 'post' | 'put' | 'delete'](route.getRoutingPath(), ...middlewares);
  }
};

export default guard;
