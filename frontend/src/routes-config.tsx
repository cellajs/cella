import { OrganizationRoute } from '~/routes/organizations';
import { UserProfileRoute } from '~/routes/users';

/**
 * Set entity paths so we can dynamically use them in the app
 */
export const baseEntityRoutes = {
  user: UserProfileRoute,
  organization: OrganizationRoute,
} as const;
