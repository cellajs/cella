import type { MiddlewareHandler } from 'hono';
import auth from './auth';
import tenant from './tenant';
import isAllowedTo from './is-allowed-to';

type TenantAccessibleFor = Parameters<typeof tenant>[2];

export const isAuthenticated = (accessibleFor?: Parameters<typeof auth>[0]): MiddlewareHandler => auth(accessibleFor);

export const organizationTenantGuard = (paramName: string, accessibleFor?: TenantAccessibleFor) =>
  [auth(), tenant(paramName, 'ORGANIZATION', accessibleFor)] as const;

export const workspaceTenantGuard = (paramName: string, accessibleFor?: TenantAccessibleFor) =>
  [auth(), tenant(paramName, 'WORKSPACE', accessibleFor)] as const;

export const projectTenantGuard = (paramName: string, accessibleFor?: TenantAccessibleFor) =>
  [auth(), tenant(paramName, 'PROJECT', accessibleFor)] as const;

export const anyTenantGuard = (paramName: string, accessibleFor?: TenantAccessibleFor) => [auth(), tenant(paramName, 'ANY', accessibleFor)] as const;

export const systemGuard = auth(['ADMIN']);

export const publicGuard: MiddlewareHandler = async (_, next) => {
  await next();
};

export { isAllowedTo };