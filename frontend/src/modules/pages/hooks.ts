import { useInfiniteQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import useSearchParams from '~/hooks/use-search-params';
import { pagesLimit, pagesListQueryOptions } from '~/modules/pages/query';
import { PagesRouteSearchParams } from '~/modules/pages/types';

export const usePagesList = () => {
  const { search, setSearch } = useSearchParams<PagesRouteSearchParams>();

  const baseQuery = {
    ...search,
    q: Array.isArray(search.q) ? search.q.join(';') : search.q ? search.q.trim() : undefined,
    limit: pagesLimit,
  };

  const query = { ...baseQuery };

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
