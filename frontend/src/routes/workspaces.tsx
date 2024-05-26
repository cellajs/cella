import { createRoute } from '@tanstack/react-router';
import type { ErrorType } from 'backend/lib/errors';
import { config } from 'config';
import { Construction, Loader } from 'lucide-react';
import { Suspense, lazy } from 'react';
import { queryClient } from '~/lib/router';
import { noDirectAccess } from '~/lib/utils';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { useElectric } from '~/modules/common/electric/electrify';
import ErrorNotice from '~/modules/common/error-notice';
import Workspace, { workspaceQueryOptions } from '~/modules/workspaces';
import { IndexRoute } from './routeTree';

// Lazy-loaded components
const Board = lazy(() => import('~/modules/projects/board'));
const TasksTable = lazy(() => import('~/modules/projects/tasks-table'));

export const WorkspaceRoute = createRoute({
  path: 'workspace/$idOrSlug',
  staticData: { pageTitle: 'Workspace', hideFooter: true },
  beforeLoad: ({ location, params }) => noDirectAccess(location.pathname, params.idOrSlug, '/board'),
  getParentRoute: () => IndexRoute,
  loader: async ({ params: { idOrSlug } }) => {
    queryClient.ensureQueryData(workspaceQueryOptions(idOrSlug));
  },
  errorComponent: ({ error }) => <ErrorNotice error={error as ErrorType} />,
  component: () => {
    const Electric = useElectric();

    // TODO: review this
    if (!Electric) {
      return (
        <div className="flex items-center justify-center grow">
          <Loader className="animate-spin" size={36} />
        </div>
      );
    }

    return (
      <Suspense>
        <Workspace />
      </Suspense>
    );
  },
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
    <div className="text-sm text-center mt-12">
      <ContentPlaceholder
        Icon={Construction}
        title="Not built yet."
        text={
          <>
            <p>Here will be a grid with tiles/cards that summarize projects with stats.</p>
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
