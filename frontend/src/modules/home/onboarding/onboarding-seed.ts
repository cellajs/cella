import type { Organization } from 'sdk';

/**
 * Hook for app-specific onboarding data seeding. Called from the organization-created
 * callback so seeding happens in the same tick the membership lands in cache.
 *
 * The cella template ships with a no-op implementation. Forks should override to seed
 * demo data (e.g. workspaces, projects, pages) for their product entities.
 *
 * Returns `true` when seeding succeeded, `false` otherwise.
 */
export const seedOnboardingDemoData = async (_organization: Organization): Promise<boolean> => {
  return true;
};
