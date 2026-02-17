/**
 * Set entity paths so we can dynamically use them in the app
 */
export const baseEntityRoutes = {
  organization: '/$tenantId/$orgSlug/organization',
} as const;

/**
 * Map entity types to their route param names.
 * Used by getContextEntityRoute to map ancestorSlugs to route params.
 *
 * For example, if a project entity has ancestorSlugs: { organization: 'acme' },
 * and routeParamMap has { organization: 'orgSlug' }, the resolver will set
 * params.orgSlug = 'acme'.
 */
export const routeParamMap: Record<string, string> = {
  organization: 'orgSlug',
};
