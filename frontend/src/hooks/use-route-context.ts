import { useRouterState } from '@tanstack/react-router';
import type { Organization } from 'sdk';

// These hooks use getRouteApi with string route IDs instead of importing route objects directly.
// This avoids circular imports between route files and component modules, which cause Vite HMR failures.

type OrganizationLayoutContext = { organization: Organization; tenantId: string };

/**
 * Organization context from the nearest active route that provides it — works for authenticated
 * (OrganizationLayoutRoute) and public routes carrying tenantId + a minimal organization. Throws if none.
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
