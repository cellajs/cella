import { AuthRoute, ResetPasswordRoute, SignInRoute, SignOutRoute, VerifyEmailRoute, VerifyEmailWithTokenRoute } from '~/routes/authentication';
import { HomeAliasRoute, HomeRoute, WelcomeRoute } from '~/routes/home';
import { AboutRoute, AccessibilityRoute, ContactRoute, LegalRoute } from '~/routes/marketing';
import { OrganizationMembersRoute, OrganizationRoute, OrganizationSettingsRoute } from '~/routes/organizations';
import { MetricsRoute, OrganizationsTableRoute, RequestsTableRoute, SystemPanelRoute, UsersTableRoute } from '~/routes/system';
import { UserProfileRoute, UserSettingsRoute } from '~/routes/users';
import { WorkspaceBoardRoute, WorkspaceOverviewRoute, WorkspaceRoute, WorkspaceTableRoute } from '~/routes/workspaces'; //WorkspaceMembersRoute,
import { AppRoute, ErrorNoticeRoute, PublicRoute, UnsubscribeRoute, acceptInviteRoute, rootRoute } from './general';

export const routeTree = rootRoute.addChildren([
  PublicRoute.addChildren([
    AboutRoute,
    UnsubscribeRoute,
    ContactRoute,
    LegalRoute,
    AccessibilityRoute,
    ErrorNoticeRoute,
    SignOutRoute,
    AuthRoute.addChildren([SignInRoute, ResetPasswordRoute, VerifyEmailRoute.addChildren([VerifyEmailWithTokenRoute]), acceptInviteRoute]),
  ]),
  AppRoute.addChildren([
    HomeRoute,
    HomeAliasRoute,
    WelcomeRoute,
    SystemPanelRoute.addChildren([UsersTableRoute, OrganizationsTableRoute, RequestsTableRoute, MetricsRoute]),
    UserProfileRoute,
    UserSettingsRoute,
    // App specific routes here
    WorkspaceRoute.addChildren([WorkspaceBoardRoute, WorkspaceTableRoute, WorkspaceOverviewRoute]),
    // Org routes on bottom because of slug directly after root path
    OrganizationRoute.addChildren([OrganizationMembersRoute, OrganizationSettingsRoute]),
  ]),
]);
