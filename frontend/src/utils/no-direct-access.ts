import { redirect } from '@tanstack/react-router';

/**
 * Redirects a directly accessed parent route to its child using the stable `beforeLoad` matches.
 * @throws A history-replacing redirect that preserves params, search, and hash.
 */
export const noDirectAccess = (matches: readonly { routeId: string }[], routeId: string, redirectTo: string) => {
  const isLeaf = matches[matches.length - 1]?.routeId === routeId;
  if (!isLeaf) return;
  throw redirect({ to: redirectTo, params: true, search: true, replace: true, hash: true });
};
