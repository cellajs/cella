import { redirect } from '@tanstack/react-router';
import router from '~/routes/router';

/**
 * Prevents direct access to a parent route by redirecting the user to a specified child route.
 *
 * @param currentTo - The parent route path or route reference to check against the current route.
 * @param redirectTo - The child route path to redirect the user to if direct access is detected.
 *
 * @throws Throws a redirect to `redirectTo` preserving current query parameters and replacing the history entry.
 *
 * @example
 * // Redirect users from `/$idOrSlug/organization` to its `/members` child route if accessed directly
 * noDirectAccess(OrganizationRoute.to, OrganizationMembersRoute.to);
 */
export const noDirectAccess = (currentTo: string, redirectTo: string) => {
  const match = router.matchRoute({ to: currentTo }, { pending: true });
  if (match === false) return;
  throw redirect({ to: redirectTo, params: true, search: true, replace: true, hash: true });
};
