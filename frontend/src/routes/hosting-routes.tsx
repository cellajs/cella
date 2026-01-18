import { createRoute, useLoaderData } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';
import { repositoriesListOptions, repositoryOptions } from '~/modules/repositories/query';
import { queryClient } from '~/query/query-client';
import { OrganizationRoute } from '~/routes/organization-routes';
import appTitle from '~/utils/app-title';

// Lazy-loaded components
const HostingPage = lazy(() => import('~/modules/repositories/hosting-page'));
const RepositoryPage = lazy(() => import('~/modules/repositories/repository-page'));
const ConnectRepositoryPage = lazy(() => import('~/modules/repositories/connect-repository-page'));

/**
 * Hosting dashboard showing connected repositories.
 */
export const HostingRoute = createRoute({
  path: '/hosting',
  staticData: { isAuth: true },
  getParentRoute: () => OrganizationRoute,
  loader: async ({ context }) => {
    const organization = context.organization;
    // Prefetch repositories list
    await queryClient.prefetchQuery(repositoriesListOptions(organization.id));
    return { organization };
  },
  head: () => ({ meta: [{ title: appTitle('Hosting') }] }),
  component: () => {
    const { organization } = useLoaderData({ from: HostingRoute.id });
    return (
      <Suspense>
        <HostingPage organizationId={organization.id} />
      </Suspense>
    );
  },
});

/**
 * Connect a new GitHub repository.
 */
export const ConnectRepositoryRoute = createRoute({
  path: '/hosting/connect',
  staticData: { isAuth: true },
  getParentRoute: () => OrganizationRoute,
  head: () => ({ meta: [{ title: appTitle('Connect Repository') }] }),
  component: () => {
    const organization = useLoaderData({ from: OrganizationRoute.id });
    return (
      <Suspense>
        <ConnectRepositoryPage organizationId={organization.id} />
      </Suspense>
    );
  },
});

/**
 * Repository details with deployments.
 */
export const RepositoryRoute = createRoute({
  path: '/hosting/repositories/$repoId',
  staticData: { isAuth: true },
  getParentRoute: () => OrganizationRoute,
  loader: async ({ params }) => {
    const repository = await queryClient.ensureQueryData(repositoryOptions(params.idOrSlug, params.repoId));
    return { repository };
  },
  head: (ctx) => {
    const repository = ctx.match.loaderData?.repository;
    return { meta: [{ title: appTitle(repository?.name || 'Repository') }] };
  },
  component: () => {
    const { repository } = useLoaderData({ from: RepositoryRoute.id });
    return (
      <Suspense>
        <RepositoryPage repository={repository} />
      </Suspense>
    );
  },
});
