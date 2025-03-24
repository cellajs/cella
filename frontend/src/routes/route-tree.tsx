import type { NavItemId } from '~/nav-config';
import {
  AcceptOrgInviteRoute,
  AuthLayoutRoute,
  AuthenticateRoute,
  CreatePasswordWithTokenRoute,
  EmailVerificationRoute,
  RequestPasswordRoute,
  SignOutRoute,
  UnsubscribedRoute,
  VerifyEmailWithTokenRoute,
} from '~/routes/auth';
import { AppRoute, ErrorNoticeRoute, PublicRoute, rootRoute } from '~/routes/base';
import { HomeAliasRoute, HomeRoute, WelcomeRoute } from '~/routes/home';
import { AboutRoute, AccessibilityRoute, ContactRoute, LegalRoute } from '~/routes/marketing';
import { OrganizationAttachmentsRoute, OrganizationMembersRoute, OrganizationRoute, OrganizationSettingsRoute } from '~/routes/organizations';
import { MetricsRoute, OrganizationsTableRoute, RequestsTableRoute, SystemRoute, UsersTableRoute } from '~/routes/system';
import { UserInOrganizationProfileRoute, UserProfileRoute, UserSettingsRoute } from '~/routes/users';

//App-specific route imports here
//...

/**
 * The route tree for the entire app
 */
export const routeTree = rootRoute.addChildren([
  PublicRoute.addChildren([
    AboutRoute,
    ContactRoute,
    LegalRoute,
    AccessibilityRoute,
    ErrorNoticeRoute,
    SignOutRoute,
    AcceptOrgInviteRoute,
    AuthLayoutRoute.addChildren([
      AuthenticateRoute,
      RequestPasswordRoute,
      CreatePasswordWithTokenRoute,
      EmailVerificationRoute,
      VerifyEmailWithTokenRoute,
      UnsubscribedRoute,
    ]),
  ]),
  AppRoute.addChildren([
    HomeRoute,
    HomeAliasRoute,
    WelcomeRoute,
    SystemRoute.addChildren([UsersTableRoute, OrganizationsTableRoute, RequestsTableRoute, MetricsRoute]),
    UserProfileRoute,
    UserInOrganizationProfileRoute,
    UserSettingsRoute,

    // App-specific routes here
    // ...

    // Org routes on bottom because of slug directly after root path
    OrganizationRoute.addChildren([OrganizationMembersRoute, OrganizationAttachmentsRoute, OrganizationSettingsRoute]),
  ]),
]);

declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    floatingNavButtons?: Array<NavItemId>;
  }
}
