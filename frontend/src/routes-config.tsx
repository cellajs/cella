/**
 * Set entity paths so we can dynamically use them in the app
 */
export const baseEntityRoutes = {
  user: '/users/$idOrSlug',
  organization: '/organizations/$idOrSlug',
} as const;
