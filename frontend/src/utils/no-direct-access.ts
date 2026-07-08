import { redirect } from '@tanstack/react-router';

/**
 * Prevents direct access to a parent route by redirecting the user to a specified child route.
 *
 * Whether the parent was accessed directly is determined from the `matches` array passed into
 * `beforeLoad` (the destination's matched route tree, root -> leaf): if this route is the leaf,
 * no child matched and access is "direct". This intentionally avoids reading the router singleton
 * (e.g. `router.matchRoute({ pending: true })`), which is timing-sensitive and can return a stale
 * result under HMR or chained redirects, leaving the user stranded on the intermediate route.
 *
 * @param matches - The `matches` array from `beforeLoad`, ordered root -> leaf.
 * @param routeId - The id of the route calling this (e.g. `/_app/$tenantId/$organizationSlug/organization`).
 * @param redirectTo - The child route path to redirect to if direct access is detected.
 *
 * @throws Throws a redirect to `redirectTo` preserving current params, search and hash, and replacing the history entry.
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
