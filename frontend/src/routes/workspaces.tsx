import { createRoute } from '@tanstack/react-router';
import type { ErrorType } from 'backend/lib/errors';
import { Suspense, lazy } from 'react';
import { queryClient } from '~/lib/router';
import { noDirectAccess } from '~/lib/utils';
import ErrorNotice from '~/modules/common/error-notice';
import Workspace, { workspaceQueryOptions } from '~/modules/workspaces';
import { IndexRoute } from './routeTree';

// Lazy-loaded components
const Board = lazy(() => import('~/modules/projects/board'));
const TasksTable = lazy(() => import('~/modules/projects/tasks-table'));

export const WorkspaceRoute = createRoute({
  path: 'workspace/$idOrSlug',
  staticData: { pageTitle: 'Workspace', hideFooter: true },
  beforeLoad: ({ location, params }) =>  noDirectAccess(location.pathname, params.idOrSlug, '/board'),
  getParentRoute: () => IndexRoute,
  loader: async ({ params: { idOrSlug } }) => {
    queryClient.ensureQueryData(workspaceQueryOptions(idOrSlug));
  },
  errorComponent: ({ error }) => <ErrorNotice error={error as ErrorType} />,
  component: () => (
    <Suspense>
      <Workspace />
    </Suspense>
  ),
});

export const WorkspaceBoardRoute = createRoute({
  path: '/board',
  staticData: { pageTitle: 'Board', hideFooter: true },
  getParentRoute: () => WorkspaceRoute,
  component: () => (
    <Suspense>
      <Board />
    </Suspense>
  ),
});

export const WorkspaceTableRoute = createRoute({
  path: '/table',
  staticData: { pageTitle: 'Table' },
  getParentRoute: () => WorkspaceRoute,
  component: () => (
    <Suspense>
      <TasksTable />
    </Suspense>
  ),
});

export const WorkspaceOverviewRoute = createRoute({
  path: '/overview',
  staticData: { pageTitle: 'Overview' },
  getParentRoute: () => WorkspaceRoute,
  component: () => (
    <div>
      <h1>Here will be an overview with stats</h1>
    </div>
  ),
});

