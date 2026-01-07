import type { NavItemId } from '~/modules/navigation/types';
import {
  AuthErrorRoute,
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
import { AboutRoute, AccessibilityRoute, ContactRoute, LegalIndexRoute, LegalRoute } from '~/routes/marketing-routes';
import {
  OrganizationAttachmentsRoute,
  OrganizationMembersRoute,
  OrganizationRoute,
  OrganizationSettingsRoute,
} from '~/routes/organization-routes';
import { PageRoute } from '~/routes/page-routes';
import {
  MetricsRoute,
  OrganizationsTableRoute,
  PagesTableRoute,
  RequestsTableRoute,
  SystemRoute,
  UsersTableRoute,
} from '~/routes/system-routes';
import { UserAccountRoute, UserInOrganizationProfileRoute, UserProfileRoute } from '~/routes/user-routes';

//App-specific route imports here
//...

/**
 * The route tree for the entire app
 */
export const routeTree = RootRoute.addChildren([
  PublicLayoutRoute.addChildren([
    AboutRoute,
    ContactRoute,
    LegalIndexRoute,
    LegalRoute,
    AccessibilityRoute,
    ErrorNoticeRoute,
    SignOutRoute,
    PageRoute,
    AuthLayoutRoute.addChildren([
      AuthenticateRoute,
      MfaRoute,
      RequestPasswordRoute,
      CreatePasswordWithTokenRoute,
      EmailVerificationRoute,
      UnsubscribedRoute,
      AuthErrorRoute,
    ]),
  ]),
  AppLayoutRoute.addChildren([
    HomeRoute,
    HomeAliasRoute,
    WelcomeRoute,
    SystemRoute.addChildren([
      UsersTableRoute,
      OrganizationsTableRoute,
      RequestsTableRoute,
      PagesTableRoute,
      MetricsRoute,
    ]),
    UserProfileRoute,
    UserInOrganizationProfileRoute,
    UserAccountRoute,
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
