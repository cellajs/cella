import { createRoute } from '@tanstack/react-router';
import type { ErrorType } from 'backend/lib/errors';
import { config } from 'config';
import { Construction } from 'lucide-react';
import { Suspense, lazy } from 'react';
import { z } from 'zod';
import { noDirectAccess } from '~/lib/utils';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import ErrorNotice from '~/modules/common/error-notice';
import { AppRoute } from '.';
import { membersSearchSchema } from './organizations';

// Lazy-loaded components
const Workspace = lazy(() => import('~/modules/workspaces'));
const Board = lazy(() => import('~/modules/projects/board/board'));
const TasksTable = lazy(() => import('~/modules/projects/tasks-table'));
const ElectricSuspense = lazy(() => import('~/modules/common/electric/suspense'));

export const WorkspaceRoute = createRoute({
  path: 'workspaces/$idOrSlug',
  validateSearch: z.object({
    ...membersSearchSchema.shape,
    projectSettings: z.enum(['general', 'members']).default('general').optional(),
  }),
  staticData: { pageTitle: 'Workspace', isAuth: true },
  beforeLoad: ({ location, params }) => noDirectAccess(location.pathname, params.idOrSlug, '/board'),
  getParentRoute: () => AppRoute,
  errorComponent: ({ error }) => <ErrorNotice error={error as ErrorType} />,
  component: () => {
    return (
      <Suspense>
        <ElectricSuspense>
          <Workspace />
        </ElectricSuspense>
      </Suspense>
    );
  },
});

export const WorkspaceBoardRoute = createRoute({
  path: '/board',
  staticData: { pageTitle: 'Board', isAuth: true },
  validateSearch: z.object({ project: z.string().optional() }),
  getParentRoute: () => WorkspaceRoute,
  component: () => <Board />,
});

export const tasksSearchSchema = z.object({
  q: z.string().optional(),
  tableSort: z.enum(['project_id', 'status', 'created_by', 'type', 'modified_at', 'created_at']).default('created_at').optional(),
  order: z.enum(['asc', 'desc']).default('asc').optional(),
  projectId: z.string().optional(),
  status: z.string().optional(),
});

export const WorkspaceTableRoute = createRoute({
  path: '/table',
  validateSearch: tasksSearchSchema,
  staticData: { pageTitle: 'Table', isAuth: true },
  getParentRoute: () => WorkspaceRoute,
  component: () => <TasksTable />,
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
