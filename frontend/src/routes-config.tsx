/**
 * Set entity paths so we can dynamically use them in the app
 */
export const baseEntityRoutes = {
  user: '/user/$idOrSlug',
  organization: '/organization/$idOrSlug',
} as const;
