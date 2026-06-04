import { useRouterState } from '@tanstack/react-router';
import type { Organization } from 'sdk';

// TODO review this pattern

// These hooks use getRouteApi with string route IDs instead of importing route objects directly.
// This avoids circular imports between route files and component modules, which cause Vite HMR failures.

type OrganizationLayoutContext = { organization: Organization; tenantId: string };

/**
 * Returns organization context from the nearest active route that provides it.
 * Works for authenticated routes (OrganizationLayoutRoute) and public routes
 * that carry tenantId + a minimal organization in context.
 * Throws if no matching route is active.
 */
export const useOrganizationLayoutContext = (): OrganizationLayoutContext => {
  const match = useRouterState({
    select: (s) =>
      s.matches.find((m) => {
        const ctx = m.context as Record<string, unknown>;
        return ctx?.organization && typeof ctx?.tenantId === 'string';
      }),
  });

  if (match) return match.context as OrganizationLayoutContext;

  throw new Error('useOrganizationLayoutContext must be used within a route that provides organization context');
};
