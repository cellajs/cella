import { CustomHono } from './types/common';

import { createRoute } from '@hono/zod-openapi';
import { MiddlewareHandler } from 'hono';
import authGuard from './middlewares/guard/auth';
import tenantGuard from './middlewares/guard/tenant';
import { rateLimiter } from './middlewares/rate-limiter';
import { signInRateLimiter } from './middlewares/rate-limiter/sign-in';
import {
  acceptInviteRoute,
  checkEmailRoute,
  resetPasswordCallbackRoute,
  resetPasswordRoute,
  sendVerificationEmailRoute,
  signInRoute,
  verifyEmailRoute,
} from './modules/auth/routes';
import { getUploadTokenRoute, inviteRoute } from './modules/general/routes';
import {
  createOrganizationRoute,
  deleteOrganizationsRoute,
  deleteUsersFromOrganizationRoute,
  getOrganizationByIdOrSlugRoute,
  getOrganizationsRoute,
  getUsersByOrganizationIdRoute,
  updateOrganizationRoute,
  updateUserInOrganizationRoute,
} from './modules/organizations/routes';
import { deleteUsersRoute, getUserByIdOrSlugRoute, getUserMenuRoute, getUsersRoute, meRoute, updateUserRoute } from './modules/users/routes';

/* 
TODO:
Whe need to refactor this 'configure' file to a new middleware system. Right now its not clear which routes are missing from this list and this is a security risk.
What about a multi-tier guard system? At least one of the following needs to be set as middleware or the build will fail and app wont run.
1. Guard.auth: checks if the user is authenticated ( => on each route except auth and public?)
2: Guard.tenant: checks if the user has a tenant/organization session that matches the tenant of the context (=> as middleware on each route that requires organization membership)
3. Guard.system: checks if the user is system admin, uses trusted IP, etc. (=> as middleware on each route that requires system admin access)
4. Guard.public: allows public access. (=> as middleware on each route that is public. Needs to be set on each route as middleware explicitly, default is Guard.auth)

Apart from the above, we also need to add rate limiter middleware to each route that requires it.

Lastly, we need a Guard.context. This checks if the user has the required role and permissions. Due to the variations and flexible use, this function
will be used in the the business/service logic?

*/

const authRateLimiter = rateLimiter({ points: 5, duration: 60 * 60, blockDuration: 60 * 10, keyPrefix: 'auth_fail' }, 'fail');

// authGuard() is used for all routes that require authentication
// tenantGuard() is used for all routes that require organization membership; it also requires authGuard() to be used before and organizationId to be in the path
const routesMiddlewares: {
  route: ReturnType<typeof createRoute>;
  middlewares: MiddlewareHandler[];
}[] = [
  { route: signInRoute, middlewares: [signInRateLimiter()] },
  { route: sendVerificationEmailRoute, middlewares: [authRateLimiter] },
  { route: verifyEmailRoute, middlewares: [authRateLimiter] },
  { route: acceptInviteRoute, middlewares: [authRateLimiter] },
  { route: resetPasswordRoute, middlewares: [authRateLimiter] },
  { route: resetPasswordCallbackRoute, middlewares: [authRateLimiter] },
  { route: checkEmailRoute, middlewares: [authRateLimiter] },
  { route: meRoute, middlewares: [authGuard()] },
  { route: getUserMenuRoute, middlewares: [authGuard()] },
  { route: getUsersRoute, middlewares: [authGuard(['ADMIN'])] },
  { route: getUserByIdOrSlugRoute, middlewares: [authGuard()] },
  { route: updateUserRoute, middlewares: [authGuard()] },
  { route: deleteUsersRoute, middlewares: [authGuard()] },
  { route: createOrganizationRoute, middlewares: [authGuard(['ADMIN'])] },
  { route: getOrganizationsRoute, middlewares: [authGuard()] },
  { route: getOrganizationByIdOrSlugRoute, middlewares: [authGuard(), tenantGuard()] },
  { route: getUsersByOrganizationIdRoute, middlewares: [authGuard(), tenantGuard()] },
  { route: updateOrganizationRoute, middlewares: [authGuard(), tenantGuard(['ADMIN'])] },
  { route: deleteOrganizationsRoute, middlewares: [authGuard(['ADMIN'])] },
  { route: updateUserInOrganizationRoute, middlewares: [authGuard(), tenantGuard(['ADMIN'])] },
  {
    route: inviteRoute,
    middlewares: [
      authGuard(),
      tenantGuard(['ADMIN']),
      rateLimiter({ points: 10, duration: 60 * 60, blockDuration: 60 * 10, keyPrefix: 'invite_success' }, 'success'),
    ],
  },
  { route: deleteUsersFromOrganizationRoute, middlewares: [authGuard(), tenantGuard(['ADMIN'])] },
  { route: getUploadTokenRoute, middlewares: [authGuard()] },
];

const configureRoutes = (app: CustomHono) => {
  for (const { route, middlewares } of routesMiddlewares) {
    app[route.method as 'get' | 'post' | 'put' | 'delete'](route.getRoutingPath(), ...middlewares);
  }
};

export default configureRoutes;
