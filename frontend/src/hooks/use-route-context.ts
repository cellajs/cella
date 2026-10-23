import { useRouterState } from '@tanstack/react-router';
import type { Organization } from 'sdk';

// String route IDs avoid circular imports between route files and component modules, which break Vite HMR.

type OrganizationContext = { organization: Organization; tenantId: string };

const findOrganizationContext = (matches: { context: unknown }[]) =>
  matches.find((match) => {
    const context = match.context as Record<string, unknown>;
    return context?.organization && typeof context?.tenantId === 'string';
  })?.context as OrganizationContext | undefined;

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
