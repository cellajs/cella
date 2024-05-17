import type { MiddlewareHandler } from 'hono';
import auth from './auth';
import tenant from './tenant';
import setCtx from './set-ctx';
import protect from './protect';

type TenantAccessibleFor = Parameters<typeof tenant>[2];

export const authGuard = (accessibleFor?: Parameters<typeof auth>[0]): MiddlewareHandler => auth(accessibleFor);

export const organizationTenantGuard = (paramName: string, accessibleFor?: TenantAccessibleFor) =>
  [auth(), tenant(paramName, 'ORGANIZATION', accessibleFor)] as const;

export const workspaceTenantGuard = (paramName: string, accessibleFor?: TenantAccessibleFor) =>
  [auth(), tenant(paramName, 'WORKSPACE', accessibleFor)] as const;

export const anyTenantGuard = (paramName: string, accessibleFor?: TenantAccessibleFor) => 
  [auth(), tenant(paramName, 'ANY', accessibleFor)] as const;

export const systemGuard = auth(['ADMIN']);

export const publicGuard: MiddlewareHandler = async (_, next) => {
  await next();
};

export { setCtx };
export { protect };