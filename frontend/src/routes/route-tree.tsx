import {
  // Layouts
  AppLayoutRoute,
  AuthLayoutRoute,
  // Base children segments
  baseAuthChildren,
  baseDocsChildren,
  baseOrganizationChildren,
  basePublicChildren,
  baseSystemChildren,
  DocsLayoutRoute,
  // Individual routes
  HomeAliasRoute,
  HomeRoute,
  OrganizationLayoutRoute,
  OrganizationRoute,
  PublicLayoutRoute,
  RootRoute,
  SystemRoute,
  UserAccountRoute,
  UserInOrganizationProfileRoute,
  UserProfileRoute,
  WelcomeRoute,
} from '~/routes/route-tree.base';

// App-specific route imports
// ..

/**
 * The route tree for the entire app.
 * Forks extend by spreading base segments and adding routes inline.
 */
export const routeTree = RootRoute.addChildren([
  PublicLayoutRoute.addChildren([
    ...basePublicChildren,
    DocsLayoutRoute.addChildren([...baseDocsChildren]),
    AuthLayoutRoute.addChildren([...baseAuthChildren]),
    // Fork public routes here
  ]),
  AppLayoutRoute.addChildren([
    HomeRoute,
    HomeAliasRoute,
    WelcomeRoute,
    SystemRoute.addChildren([...baseSystemChildren]),
    UserProfileRoute,
    UserInOrganizationProfileRoute,
    UserAccountRoute,
    OrganizationLayoutRoute.addChildren([
      OrganizationRoute.addChildren([
        ...baseOrganizationChildren,
        // Fork organization routes here
      ]),
    ]),
    // Fork app routes here
  ]),
]);
