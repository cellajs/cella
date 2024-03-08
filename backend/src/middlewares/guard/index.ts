import auth from "./auth";
import tenant from "./tenant";

export const authGuard = (accessibleFor?: Parameters<typeof auth>[0]) => [auth(accessibleFor)] as const;

export const tenantGuard = (accessibleFor?: Parameters<typeof tenant>[0]) => [auth(), tenant(accessibleFor)] as const;

export const systemGuard = [auth(['ADMIN'])] as const;

export const publicGuard = ['public'] as const;