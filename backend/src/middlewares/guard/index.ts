import type { MiddlewareHandler } from 'hono';
import auth from './auth';
import tenant from './tenant';

export const authGuard = (accessibleFor?: Parameters<typeof auth>[0]): MiddlewareHandler => auth(accessibleFor);

export const tenantGuard = (accessibleFor?: Parameters<typeof tenant>[0]) => [auth(), tenant(accessibleFor)] as const;

export const systemGuard = auth(['ADMIN']);

export const publicGuard: MiddlewareHandler = async (_, next) => {
  await next();
};
