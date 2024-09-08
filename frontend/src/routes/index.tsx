import { AuthRoute, ResetPasswordRoute, SignInRoute, SignOutRoute, VerifyEmailRoute, VerifyEmailRouteWithToken } from '~/routes/authentication';
import { HomeAliasRoute, HomeRoute, WelcomeRoute } from '~/routes/home';
import { AboutRoute, AccessibilityRoute, ContactRoute, LegalRoute } from '~/routes/marketing';
import { OrganizationMembersRoute, OrganizationRoute, OrganizationSettingsRoute } from '~/routes/organizations';
import { MetricsRoute, OrganizationsTableRoute, RequestsTableRoute, SystemPanelRoute, UsersTableRoute } from '~/routes/system';
import { UserProfileRoute, UserSettingsRoute } from '~/routes/users';
import { WorkspaceBoardRoute, WorkspaceOverviewRoute, WorkspaceRoute, WorkspaceTableRoute } from '~/routes/workspaces'; //WorkspaceMembersRoute,
import { AppRoute, ErrorNoticeRoute, PublicRoute, acceptInviteRoute, newsletterUnsubscribeRoute, rootRoute } from './general';

export const routeTree = rootRoute.addChildren([
  PublicRoute.addChildren([
    AboutRoute,
    newsletterUnsubscribeRoute,
    ContactRoute,
    LegalRoute,
    AccessibilityRoute,
    ErrorNoticeRoute,
    SignOutRoute,
    AuthRoute.addChildren([SignInRoute, ResetPasswordRoute, VerifyEmailRoute.addChildren([VerifyEmailRouteWithToken]), acceptInviteRoute]),
  ]),
  AppRoute.addChildren([
    HomeRoute,
    HomeAliasRoute,
    WelcomeRoute,
    SystemPanelRoute.addChildren([UsersTableRoute, OrganizationsTableRoute, RequestsTableRoute, MetricsRoute]),
    UserProfileRoute,
    UserSettingsRoute,
    WorkspaceRoute.addChildren([WorkspaceBoardRoute, WorkspaceTableRoute, WorkspaceOverviewRoute]),
    OrganizationRoute.addChildren([OrganizationMembersRoute, OrganizationSettingsRoute]),
  ]),
]);
