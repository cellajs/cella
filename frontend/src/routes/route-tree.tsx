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
import {
  DocsLayoutRoute,
  DocsOperationsRoute,
  DocsOperationsTableRoute,
  DocsOverviewRoute,
  DocsPageRoute,
  DocsPagesRoute,
  DocsSchemasRoute,
} from '~/routes/docs-routes';
import { HomeAliasRoute, HomeRoute, WelcomeRoute } from '~/routes/home-routes';
import { ConnectRepositoryRoute, HostingRoute, RepositoryRoute } from '~/routes/hosting-routes';
import { AboutRoute, AccessibilityRoute, ContactRoute, LegalIndexRoute, LegalRoute } from '~/routes/marketing-routes';
import {
  OrganizationAttachmentsRoute,
  OrganizationMembersRoute,
  OrganizationRoute,
  OrganizationSettingsRoute,
} from '~/routes/organization-routes';
import {
  MetricsRoute,
  OrganizationsTableRoute,
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
    DocsLayoutRoute.addChildren([
      DocsOperationsRoute,
      DocsOperationsTableRoute,
      DocsOverviewRoute,
      DocsSchemasRoute,
      DocsPagesRoute,
      DocsPageRoute,
    ]),
    LegalIndexRoute,
    LegalRoute,
    AccessibilityRoute,
    ErrorNoticeRoute,
    SignOutRoute,
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
    SystemRoute.addChildren([UsersTableRoute, OrganizationsTableRoute, RequestsTableRoute, MetricsRoute]),
    UserProfileRoute,
    UserInOrganizationProfileRoute,
    UserAccountRoute,
    OrganizationRoute.addChildren([
      OrganizationMembersRoute,
      OrganizationAttachmentsRoute,
      OrganizationSettingsRoute,
      HostingRoute,
      ConnectRepositoryRoute,
      RepositoryRoute,
    ]),

    // App-specific routes here
    // ...
  ]),
]);

declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    floatingNavButtons?: Array<NavItemId>;
  }
}
