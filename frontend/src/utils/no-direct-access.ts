import { redirect } from '@tanstack/react-router';

/**
 * Prevents direct access to a parent route by redirecting to a child route.
 *
 * Whether the parent was accessed directly is read from the `matches` array passed into
 * `beforeLoad` (root -> leaf): if this route is the leaf, no child matched, so access is "direct".
 * Intentionally avoids the router singleton (e.g. `router.matchRoute({ pending: true })`), which is
 * timing-sensitive and can return a stale result under HMR or chained redirects, stranding the user.
 *
 * @throws a redirect to `redirectTo`, preserving params/search/hash and replacing the history entry.
 *
 * @example
 * beforeLoad: ({ matches }) => {
 *   noDirectAccess(matches, '/_app/$tenantId/$organizationSlug/organization', '/$tenantId/$organizationSlug/organization/attachments');
 * }
 */
export const noDirectAccess = (matches: readonly { routeId: string }[], routeId: string, redirectTo: string) => {
  const isLeaf = matches[matches.length - 1]?.routeId === routeId;
  if (!isLeaf) return;
  throw redirect({ to: redirectTo, params: true, search: true, replace: true, hash: true });
};
