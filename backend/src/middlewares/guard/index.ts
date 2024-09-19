import type { Context, Next } from 'hono';
import { getContextUser } from '#/lib/context';
import { errorResponse } from '#/lib/errors';
export { isAllowedTo } from './is-allowed-to';
export { isAuthenticated } from './is-authenticated';
export { splitByAllowance } from './split-by-allowance';

export async function isSystemAdmin(ctx: Context, next: Next): Promise<Response | undefined> {
  // Extract user
  const user = getContextUser();

  // TODO: Add more checks for system admin, such as IP address, 2FA etc.
  if (!user || !user.role.includes('admin')) {
    return errorResponse(ctx, 403, 'forbidden', 'warn', undefined, { user: user.id });
  }

  await next();
}

export async function isPublicAccess(_: Context, next: Next): Promise<void> {
  await next();
}
