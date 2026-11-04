import { type RegisteredRouter, type RouterState, useRouterState } from '@tanstack/react-router';

// Finds the match by its context shape: importing the layout route would make a route file and a component import each other (breaks Vite HMR).
const findOrganizationContext = (matches: RouterState<RegisteredRouter['routeTree']>['matches']) => {
  for (const { context } of matches) {
    if (context && 'organization' in context && context.organization) return context;
  }
};

/**
 * Organization and tenant ids from the nearest route that provides them; throws when no match carries them.
 * Selects primitives because match context is rebuilt on every navigation, search-only ones included.
 */
export const useOrganizationLayoutContext = (): { organizationId: string; tenantId: string } => {
  const organizationId = useRouterState({ select: (state) => findOrganizationContext(state.matches)?.organization.id });
  const tenantId = useRouterState({ select: (state) => findOrganizationContext(state.matches)?.tenantId });

  if (organizationId && tenantId) return { organizationId, tenantId };

  throw new Error('useOrganizationLayoutContext must be used within a route that provides organization context');
};
