import { CustomHono } from '../types/common';

import { createRoute } from '@hono/zod-openapi';
import { MiddlewareHandler } from 'hono';
import {
  checkEmailRoute,
  resetPasswordCallbackRoute,
  resetPasswordRoute,
  sendVerificationEmailRoute,
  signInRoute,
  verifyEmailRoute,
} from './auth/routes';
import { acceptInviteRoute, getUploadTokenRoute, inviteRoute } from './general/routes';
import authMiddleware from './middlewares/auth-middleware';
import organizationAuthMiddleware from './middlewares/organization-auth-middleware';
import { rateLimiter, signInRateLimiter } from './middlewares/rate-limiter';
import {
  createOrganizationRoute,
  deleteOrganizationRoute,
  deleteUserFromOrganizationRoute,
  getOrganizationByIdOrSlugRoute,
  getOrganizationsRoute,
  getUsersByOrganizationIdRoute,
  updateOrganizationRoute,
  updateUserInOrganizationRoute,
} from './organizations/routes';
import { deleteUserRoute, getUserByIdOrSlugRoute, getUserMenuRoute, getUsersRoute, meRoute, updateUserRoute } from './users/routes';

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
    route: sendVerificationEmailRoute,
    middlewares: [rateLimiter({ points: 3, duration: 60 * 60, blockDuration: 60 * 30 }, 'fail')],
  },
  {
    route: verifyEmailRoute,
    middlewares: [rateLimiter({ points: 10, duration: 60 * 60, blockDuration: 60 * 10 }, 'fail')],
  },
  {
    route: acceptInviteRoute,
    middlewares: [rateLimiter({ points: 10, duration: 60 * 60, blockDuration: 60 * 10 }, 'fail')],
  },
  {
    route: resetPasswordRoute,
    middlewares: [rateLimiter({ points: 5, duration: 60 * 60, blockDuration: 60 * 10 }, 'fail')],
  },
  {
    route: resetPasswordCallbackRoute,
    middlewares: [rateLimiter({ points: 10, duration: 60 * 60, blockDuration: 60 * 10 }, 'fail')],
  },
  {
    route: checkEmailRoute,
    middlewares: [rateLimiter({ points: 10, duration: 60 * 60, blockDuration: 60 * 30 }, 'fail')],
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
    middlewares: [authMiddleware()],
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
    middlewares: [authMiddleware(['ADMIN']), organizationAuthMiddleware(['ADMIN'])],
  },
  {
    route: updateUserInOrganizationRoute,
    middlewares: [authMiddleware(), organizationAuthMiddleware(['ADMIN'])],
  },
  {
    route: inviteRoute,
    middlewares: [
      authMiddleware(),
      organizationAuthMiddleware(['ADMIN']),
      rateLimiter({ points: 10, duration: 60 * 60, blockDuration: 60 * 30 }, 'success'),
    ],
  },
  {
    route: deleteUserFromOrganizationRoute,
    middlewares: [authMiddleware(), organizationAuthMiddleware(['ADMIN'])],
  },
  {
    route: getUploadTokenRoute,
    middlewares: [authMiddleware()],
  },
];

const guard = (app: CustomHono) => {
  for (const { route, middlewares } of routesMiddlewares) {
    app[route.method as 'get' | 'post' | 'put' | 'delete'](route.getRoutingPath(), ...middlewares);
  }
};

export default guard;
