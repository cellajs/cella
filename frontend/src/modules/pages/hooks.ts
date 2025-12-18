import { useInfiniteQuery } from '@tanstack/react-query';
import { useMatchRoute } from '@tanstack/react-router';
import { useCallback } from 'react';
import useSearchParams from '~/hooks/use-search-params';
import { pagesLimit, pagesListQueryOptions } from '~/modules/pages/query';
import type { PagesSearch } from '~/modules/pages/types';

// #region Helpers

const usePathIds = () => {
  const matchRoute = useMatchRoute();

  const projectMatch = matchRoute({ to: '/$orgIdOrSlug/project/$idOrSlug' as string, fuzzy: true });
  const workspaceMatch = matchRoute({ to: '/$orgIdOrSlug/workspace/$idOrSlug' as string, fuzzy: true });

  const matchUnion = projectMatch ?? workspaceMatch ?? undefined;

  return {
    orgIdOrSlug: matchUnion && 'orgIdOrSlug' in matchUnion ? matchUnion.orgIdOrSlug : undefined,
    projectIdOrSlug: projectMatch && 'idOrSlug' in projectMatch ? projectMatch.idOrSlug : undefined,
    workspaceIdOrSlug: workspaceMatch && 'idOrSlug' in workspaceMatch ? workspaceMatch.idOrSlug : undefined,
  };
};

// #endregion

// #region Queries

export const usePagesList = () => {
  const { orgIdOrSlug } = usePathIds();
  const { search, setSearch } = useSearchParams<PagesSearch>();

  const baseQuery = {
    ...search,
    q: Array.isArray(search.q) ? search.q.join(';') : search.q ? search.q.trim() : undefined,
    limit: pagesLimit,
  };

  const query = orgIdOrSlug ? { ...baseQuery } : { ...baseQuery };

  const { data, error, isLoading, isFetching, hasNextPage, ...queryProps } = useInfiniteQuery({
    ...pagesListQueryOptions(query),
    select: ({ pages }) => pages.flatMap(({ items }) => items),
  });

  // isFetching already includes next page fetch scenario
  const fetchNextPage = useCallback(async () => {
    if (!hasNextPage || isLoading || isFetching) return;
    await queryProps.fetchNextPage();
  }, [isLoading, isFetching, hasNextPage]);

  return {
    search: baseQuery,
    setSearch,
    data,
    error,
    isLoading,
    isFetching,
    hasNextPage,
    fetchNextPage,
  };
};

// #endregion

// #region Mutations

// export const useCreatePages = () => {
//   return useTableMutation({
//     table: 'pages',
//     type: 'create',
//     mutationFn: async (toCreate: Page[]): Promise<Page[]> => {
//       return toCreate;
//     },
//   });
// };

// export const useUpdatePages = () => {
//   return useTableMutation({
//     table: 'pages',
//     type: 'update',
//     mutationFn: async (toUpdate: Page[]): Promise<Page[]> => {
//       return toUpdate;
//     },
//   });
// };

// export const useDeletePages = () => {
//   return useTableMutation({
//     table: 'pages',
//     type: 'delete',
//     mutationFn: async (toDelete: Page[]): Promise<Page[]> => {
//       return toDelete;
//     },
//   });
// };

// #endregion
