import type { NavItemId } from '~/nav-config';
import {
  AcceptOrgInviteRoute,
  AuthLayoutRoute,
  AuthenticateRoute,
  CreatePasswordWithTokenRoute,
  RequestPasswordRoute,
  RequestVerificationRoute,
  SignOutRoute,
  VerifyEmailWithTokenRoute,
} from '~/routes/auth';
import { HomeAliasRoute, HomeRoute, WelcomeRoute } from '~/routes/home';
import { AboutRoute, AccessibilityRoute, ContactRoute, LegalRoute } from '~/routes/marketing';
import { OrganizationAttachmentsRoute, OrganizationMembersRoute, OrganizationRoute, OrganizationSettingsRoute } from '~/routes/organizations';
import { MetricsRoute, OrganizationsTableRoute, RequestsTableRoute, SystemRoute, UsersTableRoute } from '~/routes/system';
import { UserProfileRoute, UserSettingsRoute } from '~/routes/users';
import { AppRoute, ErrorNoticeRoute, PublicRoute, UnsubscribeRoute, rootRoute } from './general';

export const routeTree = rootRoute.addChildren([
  PublicRoute.addChildren([
    AboutRoute,
    UnsubscribeRoute,
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
      RequestVerificationRoute,
      VerifyEmailWithTokenRoute,
    ]),
  ]),
  AppRoute.addChildren([
    HomeRoute,
    HomeAliasRoute,
    WelcomeRoute,
    SystemRoute.addChildren([UsersTableRoute, OrganizationsTableRoute, RequestsTableRoute, MetricsRoute]),
    UserProfileRoute,
    UserSettingsRoute,
    // App specific routes here
    // ...

    // Org routes on bottom because of slug directly after root path
    OrganizationRoute.addChildren([OrganizationMembersRoute, OrganizationAttachmentsRoute, OrganizationSettingsRoute]),
  ]),
]);

declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    showedDesktopNavButtons?: NavItemId[];
    showedMobileNavButtons?: NavItemId[];
  }
}
