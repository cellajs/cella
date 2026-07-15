import type { Organization } from 'sdk';

/**
 * App-specific onboarding data seeding. Called from the organization-created callback so seeding
 * happens in the same tick the membership lands in cache.
 *
 * Cella ships a no-op; forks override to seed demo data (workspaces, projects, pages) for their entities.
 */
export const seedOnboardingDemoData = async (_organization: Organization): Promise<boolean> => {
  return true;
};
