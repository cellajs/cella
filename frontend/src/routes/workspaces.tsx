import { createRoute } from '@tanstack/react-router';
import type { ErrorType } from 'backend/lib/errors';
import { config } from 'config';
import { Construction } from 'lucide-react';
import { Suspense, lazy } from 'react';
import { z } from 'zod';
import { queryClient } from '~/lib/router';
import { noDirectAccess } from '~/lib/utils';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import ErrorNotice from '~/modules/common/error-notice';
import { workspaceQueryOptions } from '~/modules/workspaces/helpers/quey-options';
import { useWorkspaceStore } from '~/store/workspace';
import { AppRoute } from '.';

// Lazy-loaded components
const Workspace = lazy(() => import('~/modules/workspaces'));
const Board = lazy(() => import('~/modules/projects/board/board'));
const TasksTable = lazy(() => import('~/modules/tasks/tasks-table'));

export const labelsSearchSchema = z.object({
  q: z.string().optional(),
  sort: z.enum(['name', 'useCount', 'lastUsed']).default('name').optional(),
  order: z.enum(['asc', 'desc']).default('asc').optional(),
});

export const WorkspaceRoute = createRoute({
  path: 'workspaces/$idOrSlug',
  staticData: { pageTitle: 'Workspace', isAuth: true },
  beforeLoad: ({ location, params }) => noDirectAccess(location.pathname, params.idOrSlug, '/board'),
  getParentRoute: () => AppRoute,
  loader: async ({ params: { idOrSlug } }) => {
    const workspaceData = await queryClient.ensureQueryData(workspaceQueryOptions(idOrSlug));
    useWorkspaceStore.setState({ workspace: workspaceData.workspace, projects: workspaceData.projects, labels: workspaceData.labels });
  },
  errorComponent: ({ error }) => <ErrorNotice error={error as ErrorType} />,
  component: () => {
    return (
      <Suspense>
        <Workspace />
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
  validateSearch: z.object({ project: z.string().optional(), q: z.string().optional() }),
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
  component: () => (
    <div className="text-sm text-center mt-12">
      <ContentPlaceholder
        Icon={Construction}
        title="Not built yet."
        text={
          <>
            <p>Here will be a grid of project cards for stats, analytics and advisory.</p>
            <p className="mt-4">
              Please connect on
              <a href={config.company.githubUrl} className="underline underline-offset-2 text-primary mx-1" target="_blank" rel="noreferrer">
                Github
              </a>
              if you want to help out as OS contributor!
            </p>
          </>
        }
      />
    </div>
  ),
});
