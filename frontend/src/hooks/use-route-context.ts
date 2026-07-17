import { useRouterState } from '@tanstack/react-router';
import type { Organization } from 'sdk';

// String route IDs avoid circular imports from route objects.
// This avoids circular imports between route files and component modules, which cause Vite HMR failures.

type OrganizationLayoutContext = { organization: Organization; tenantId: string };

/**
 * Organization context from the nearest active route that provides it. Works for authenticated
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
