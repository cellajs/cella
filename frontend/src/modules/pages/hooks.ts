import { QueryKey, useInfiniteQuery, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { useMatchRoute } from '@tanstack/react-router';
import { EntityType } from 'config';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Page } from '~/api.gen';
import { useMutation } from '~/hooks/use-mutations';
import useSearchParams from '~/hooks/use-search-params';
import { pageQueryOptions, pagesDetailsQueryOptions, pagesLimit, pagesListQueryOptions } from '~/modules/pages/queries';
import { PagesSearch } from '~/modules/pages/types';
import { InfiniteQueryData, QueryData } from '~/query/types';
import { nanoid } from '~/utils/nanoid';
import { toaster } from '../common/toaster/service';

// #region Helpers

// export const usePrefetch = (table: string, query: Q) => {
//   // if (!onlineManager.isOnline()) return undefined;

//   const queryClient = useQueryClient()

//   useEffect(() => {
//     if ('getNextPageParam' in options) {
//       queryClient.ensureInfiniteQueryData(options);
//     } else {
//       queryClient.ensureQueryData(options)
//     }

//     queryClient.prefetchQuery(queryListOptions(table, { ...query, offset: query.offset + query.limit }));
//   }, [table, query.filter, query.sort, query.limit, query.offset]);
// }

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

type TableName<T extends EntityType | 'page'> = `${T}s`;

const getTableQueries = <N extends TableName<EntityType | 'page'>, T extends { id: string }>(queryKeyFilter: [N]) => {
  const queryClient = useQueryClient();
  return queryClient.getQueriesData<T | T[]>({ queryKey: queryKeyFilter });
};

// #endregion

// #region Queries

export const usePage = (id: string) => {
  const { orgIdOrSlug } = usePathIds();
  return useQuery(pageQueryOptions(id, orgIdOrSlug));
};

export const usePagesDetails = () => {
  const { orgIdOrSlug } = usePathIds();
  return useSuspenseQuery(pagesDetailsQueryOptions({}, orgIdOrSlug));
};

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
    ...pagesListQueryOptions(query, orgIdOrSlug),
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

const isInfiniteData = <T>(data: QueryData<T> | InfiniteQueryData<T>): data is InfiniteQueryData<T> => {
  return 'pages' in data;
};

const handlers = {
  create: <T extends { id: string }>(cached: T[], item: T | T[]): T[] => {
    const items = Array.isArray(item) ? item : [item];
    return [...cached, ...items];
  },
  update: <T extends { id: string }>(cached: T[], item: T | T[]) => {
    const items = Array.isArray(item) ? item : [item];
    return cached.map((item) => {
      const match = items.find((i) => i.id === item.id);
      return match ?? item;
    });
  },
  delete: <T extends { id: string }>(cached: T[], id: string | string[]) => {
    const ids = Array.isArray(id) ? id : [id];
    return cached.filter((item) => ids.includes(item.id));
  },
};

const useTableMutation = <N extends TableName<EntityType | 'page'>, T extends { id: string }, R extends Partial<T>>({
  table,
  type,
  mutationFn,
}: {
  table: N;
  type: 'create' | 'update' | 'delete';
  mutationFn: (data: R) => Promise<T>;
}) => {
  const keyFilter: [N] = [table];

  const { t } = useTranslation();

  return useMutation({
    mutationFn,
    onMutate: async (variables, context) => {
      const optimisticId = variables.id ?? nanoid(); // oof

      const previous: [QueryKey, T | T[], string | undefined][] = [];

      for (const [queryKey, cached] of getTableQueries<N, T>(keyFilter)) {
        // Cancel outgoing refetches to avoid overwriting optimistic update
        await context.client.cancelQueries({ queryKey });

        // Snapshot the previous value
        if (!cached) {
          continue;
        }

        const handleUpdate = handlers[type];

        // Optimistically update to the new value
        // @ts-ignore
        context.client.setQueryData<QueryData<T> | InfiniteQueryData<T>>(queryKey, (prev) => {
          if (!prev) {
            return prev;
          }

          // Handle Infinite case
          if (isInfiniteData(prev)) {
            const original = prev.pages.flatMap(({ items }) => items);
            // @ts-ignore
            const updated = handleUpdate(original, variables);

            if (!updated.length) {
              // ?
              return {
                pages: [{ items: [], total: 0 }],
                pageParams: [0],
              };
            }

            const limit = null; // grab
            const pageLimit = (limit ?? prev.pages.length > 1) ? prev.pages[0].items.length : null;
            // Dump everything in one page if no limit
            if (!pageLimit) {
              return {
                pages: [
                  {
                    items: updated,
                    total: updated.length,
                  },
                ],
                pageParams: [0],
              };
            }

            // Create new pages to account for adds/deletes
            const chunks: T[][] = [];
            for (let i = 0; i < updated.length; i += pageLimit) {
              chunks.push(updated.slice(i, i + pageLimit));
            }

            return {
              pages: chunks.map((items) => {
                return {
                  items,
                  total: items.length,
                };
              }),
              pageParams: chunks.map((_, i) => i),
            };
          }

          // Handle Query case
          const original = prev.items;
          // @ts-ignore
          const updated = handleUpdate(original, variables);

          return {
            items: updated,
            total: updated.length,
          };
        });

        previous.push([queryKey, cached, optimisticId]);
      }

      // side effects

      // Return a result with the snapshotted value(s)
      return previous;
    },
    onError: (_error, _variables, onMutateResult, context) => {
      toaster(t(`error:${type}_resource`, { resource: t(`app:${table}`) }), 'error');

      if (!onMutateResult?.length) {
        return;
      }

      for (const [queryKey, cached] of onMutateResult) {
        context.client.setQueryData(queryKey, cached);
      }
    },
    onSettled: (_data, _error, _variables, _onMutateResult, context) => {
      context.client.invalidateQueries({ queryKey: keyFilter });
    },
  });
};

export const useCreatePage = () => {
  return useTableMutation({
    table: 'pages',
    type: 'create',
    // @ts-ignore
    mutationFn: async (page: Pick<Page, 'title' | 'content'>) => {},
  });
};

// #endregion
