import type { NavItemId } from '~/modules/navigation/types';
import {
  AcceptEntityInviteRoute,
  AuthenticateRoute,
  AuthLayoutRoute,
  CreatePasswordWithTokenRoute,
  EmailVerificationRoute,
  MfaRoute,
  RequestPasswordRoute,
  SignOutRoute,
  UnsubscribedRoute,
} from '~/routes/auth-routes';
import { AppLayoutRoute, ErrorNoticeRoute, PublicLayoutRoute, RootRoute } from '~/routes/base-routes';
import { HomeAliasRoute, HomeRoute, WelcomeRoute } from '~/routes/home-routes';
import { AboutRoute, AccessibilityRoute, ContactRoute, LegalRoute } from '~/routes/marketing-routes';
import { OrganizationAttachmentsRoute, OrganizationMembersRoute, OrganizationRoute, OrganizationSettingsRoute } from '~/routes/organization-routes';
import { MetricsRoute, OrganizationsTableRoute, RequestsTableRoute, SystemRoute, UsersTableRoute } from '~/routes/system-routes';
import { UserInOrganizationProfileRoute, UserProfileRoute, UserSettingsRoute } from '~/routes/user-routes';

//App-specific route imports here
//...

/**
 * The route tree for the entire app
 */
export const routeTree = RootRoute.addChildren([
  PublicLayoutRoute.addChildren([
    AboutRoute,
    ContactRoute,
    LegalRoute,
    AccessibilityRoute,
    ErrorNoticeRoute,
    SignOutRoute,
    AuthLayoutRoute.addChildren([
      AuthenticateRoute.addChildren([MfaRoute]),
      RequestPasswordRoute,
      CreatePasswordWithTokenRoute,
      EmailVerificationRoute,
      UnsubscribedRoute,
    ]),
  ]),
  AppLayoutRoute.addChildren([
    HomeRoute,
    HomeAliasRoute,
    AcceptEntityInviteRoute,
    WelcomeRoute,
    SystemRoute.addChildren([UsersTableRoute, OrganizationsTableRoute, RequestsTableRoute, MetricsRoute]),
    UserProfileRoute,
    UserInOrganizationProfileRoute,
    UserSettingsRoute,
    OrganizationRoute.addChildren([OrganizationMembersRoute, OrganizationAttachmentsRoute, OrganizationSettingsRoute]),

    // App-specific routes here
    // ...
  ]),
]);

declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    floatingNavButtons?: Array<NavItemId>;
  }
}
