import { queryOptions } from '@tanstack/react-query';
import { disconnectRepository, getRepository, listGithubRepos, listRepositories, triggerDeployment } from '~/api.gen';

/** Query keys for repositories */
export const repositoriesKeys = {
  all: ['repositories'] as const,
  list: (orgIdOrSlug: string) => [...repositoriesKeys.all, 'list', orgIdOrSlug] as const,
  detail: (orgIdOrSlug: string, id: string) => [...repositoriesKeys.all, 'detail', orgIdOrSlug, id] as const,
  github: () => [...repositoriesKeys.all, 'github'] as const,
};

/** Query options for listing repositories in an organization */
export const repositoriesListOptions = (orgIdOrSlug: string, params?: { limit?: number; offset?: number }) =>
  queryOptions({
    queryKey: repositoriesKeys.list(orgIdOrSlug),
    queryFn: () =>
      listRepositories({
        path: { orgIdOrSlug },
        query: {
          limit: params?.limit?.toString(),
          offset: params?.offset?.toString(),
        },
      }),
  });

/** Query options for fetching a single repository */
export const repositoryOptions = (orgIdOrSlug: string, id: string) =>
  queryOptions({
    queryKey: repositoriesKeys.detail(orgIdOrSlug, id),
    queryFn: () =>
      getRepository({
        path: { orgIdOrSlug, id },
      }),
  });

/** Query options for listing user's GitHub repositories */
export const githubReposOptions = (params?: { page?: number; perPage?: number }) =>
  queryOptions({
    queryKey: repositoriesKeys.github(),
    queryFn: () =>
      listGithubRepos({
        query: {
          page: params?.page?.toString(),
          perPage: params?.perPage?.toString(),
        },
      }),
  });

/** Trigger a deployment for a repository */
export const triggerRepositoryDeployment = async (
  orgIdOrSlug: string,
  id: string,
  body?: { commitSha?: string; source?: 'release' | 'workflow' },
) => triggerDeployment({ path: { orgIdOrSlug, id }, body });

/** Disconnect a repository */
export const disconnectRepositoryMutation = async (orgIdOrSlug: string, id: string) =>
  disconnectRepository({ path: { orgIdOrSlug, id } });
