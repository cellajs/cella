import { onlineManager } from '@tanstack/react-query';
import { createRoute } from '@tanstack/react-router';
import type { ErrorType } from 'backend/lib/errors';
import { Suspense, lazy } from 'react';
import { z } from 'zod';
import { queryClient } from '~/lib/router';
import ErrorNotice from '~/modules/common/error-notice';
import Overview from '~/modules/projects/overview';
import { workspaceQueryOptions } from '~/modules/workspaces/helpers/query-options';
import { baseEntityRoutes } from '~/nav-config';
import { useWorkspaceStore } from '~/store/workspace';
import { noDirectAccess } from '~/utils/utils';
import { AppRoute } from './general';

// Lazy-loaded components
const WorkspacePage = lazy(() => import('~/modules/workspaces/workspace-page'));
const Board = lazy(() => import('~/modules/projects/board/board'));
const TasksTable = lazy(() => import('~/modules/tasks/tasks-table'));

export const labelsSearchSchema = z.object({
  q: z.string().optional(),
  sort: z.enum(['name', 'useCount', 'lastUsed']).default('name').optional(),
  order: z.enum(['asc', 'desc']).default('asc').optional(),
});

export const WorkspaceRoute = createRoute({
  path: baseEntityRoutes.workspace,
  staticData: { pageTitle: 'Workspace', isAuth: true },
  beforeLoad: ({ location, params }) => noDirectAccess(location.pathname, params.idOrSlug, '/board'),
  getParentRoute: () => AppRoute,
  loader: ({ params: { idOrSlug, orgIdOrSlug } }) => {
    const queryOptions = workspaceQueryOptions(idOrSlug, orgIdOrSlug);
    const cachedData = queryClient.getQueryData(queryOptions.queryKey);
    if (cachedData) {
      useWorkspaceStore.setState({
        workspace: cachedData.workspace,
        projects: cachedData.projects,
        labels: cachedData.labels,
        members: cachedData.members,
      });
    }
    // do not load if we are offline or hydrating because it returns a promise that is pending until we go online again
    return (
      cachedData ??
      (onlineManager.isOnline()
        ? queryClient.fetchQuery(queryOptions).then((data) => {
            useWorkspaceStore.setState({
              workspace: data.workspace,
              projects: data.projects,
              labels: data.labels,
              members: data.members,
            });
          })
        : undefined)
    );
  },
  errorComponent: ({ error }) => <ErrorNotice error={error as ErrorType} />,
  component: () => {
    return (
      <Suspense>
        <WorkspacePage />
      </Suspense>
    );
  },
});

export const tasksSearchSchema = z.object({
  q: z.string().optional(),
  sort: z.enum(['projectId', 'status', 'createdBy', 'type', 'modifiedAt', 'createdAt']).default('createdAt').optional(),
  order: z.enum(['asc', 'desc']).default('asc').optional(),
  projectId: z.string().optional(),
  status: z.number().or(z.string()).optional(),
  taskIdPreview: z.string().optional(),
  userIdPreview: z.string().optional(),
});

export const WorkspaceBoardRoute = createRoute({
  path: '/board',
  staticData: { pageTitle: 'Board', isAuth: true },
  validateSearch: z.object({ project: z.string().optional(), q: z.string().optional(), taskIdPreview: z.string().optional() }),
  getParentRoute: () => WorkspaceRoute,
  component: () => (
    <Suspense>
      <Board />
    </Suspense>
  ),
});

export const WorkspaceTableRoute = createRoute({
  path: '/table',
  validateSearch: tasksSearchSchema,
  staticData: { pageTitle: 'Table', isAuth: true },
  getParentRoute: () => WorkspaceRoute,
  component: () => (
    <Suspense>
      <TasksTable />
    </Suspense>
  ),
});

export const WorkspaceOverviewRoute = createRoute({
  path: '/overview',
  staticData: { pageTitle: 'Overview', isAuth: true },
  getParentRoute: () => WorkspaceRoute,
  component: () => <Overview />,
});
