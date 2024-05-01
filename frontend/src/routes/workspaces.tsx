import { createRoute } from '@tanstack/react-router';
import type { ErrorType } from 'backend/lib/errors';
import { Suspense, lazy } from 'react';
import { queryClient } from '~/lib/router';
import { noDirectAccess } from '~/lib/utils';
import ErrorNotice from '~/modules/common/error-notice';
import Workspace, { workspaceQueryOptions } from '~/modules/workspaces';
import { IndexRoute } from './routeTree';

// Lazy-loaded components
const Projects = lazy(() => import('~/modules/projects'));

export const WorkspaceRoute = createRoute({
  path: 'workspace/$idOrSlug',
  staticData: { pageTitle: 'Workspace', hideFooter: true },
  beforeLoad: ({ location, params }) =>  noDirectAccess(location.pathname, params.idOrSlug, '/projects'),
  getParentRoute: () => IndexRoute,
  loader: async ({ params: { idOrSlug } }) => {
    queryClient.ensureQueryData(workspaceQueryOptions(idOrSlug));

    const { worker } = await import('~/mocks/worker')
 
    // `worker.start()` returns a Promise that resolves
    // once the Service Worker is up and ready to intercept requests.
    return worker.start()
  },
  onLeave: async () => {
    console.log('Stopping worker')
    const { worker } = await import('~/mocks/worker')
    return worker.stop()
  },
  errorComponent: ({ error }) => <ErrorNotice error={error as ErrorType} />,
  component: () => (
    <Suspense>
      <Workspace />
    </Suspense>
  ),
});

export const WorkspaceProjectsRoute = createRoute({
  path: '/projects',
  staticData: { pageTitle: 'Projects', hideFooter: true },
  getParentRoute: () => WorkspaceRoute,
  component: () => (
    <Suspense>
      <Projects />
    </Suspense>
  ),
});
