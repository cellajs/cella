import { type QueryKey } from '@tanstack/react-query';
import type { EntityType } from 'config';
import { useTranslation } from 'react-i18next';
import { useMutation } from '~/hooks/use-mutations';
import { toaster } from '~/modules/common/toaster/service';
import type { InfiniteQueryData, QueryData } from '~/query/types';

type OptimisticHandlers = typeof optimisticHandlers;
type MutationType = keyof OptimisticHandlers;

type WithId = { id: string };

const optimisticHandlers = {
  create: <T extends WithId>(cached: T[], data: T[]): T[] => {
    return [...cached, ...data];
  },
  update: <T extends WithId>(cached: T[], data: T[]): T[] => {
    return cached.map((item) => {
      const match = data.find((i) => i.id === item.id);
      return match ?? item;
    });
  },
  delete: <T extends WithId>(cached: T[], data: T[]): T[] => {
    return cached.filter((item) => data.some((i) => i.id === item.id));
  },
} as const;

const optimistically = <T extends WithId, M extends MutationType>(type: M, cached: T[], data: T[]): T[] => {
  return optimisticHandlers[type]<T>(cached, data);
};

const handleDetails = <T extends WithId, M extends MutationType>(
  type: M,
  cached: QueryData<T>,
  data: T[],
): QueryData<T> => {
  const updated = optimistically(type, cached.items, data);

  return {
    items: updated,
    total: updated.length,
  };
};

const handleList = <T extends WithId, M extends MutationType>(
  type: M,
  cached: InfiniteQueryData<T>,
  data: T[],
): InfiniteQueryData<T> => {
  const original = cached.pages.flatMap(({ items }) => items);

  const updated = optimistically(type, original, data);

  if (!updated.length) {
    return {
      pages: [{ items: [], total: 0 }],
      pageParams: [{ page: 0, offset: 0 }],
    };
  }

  const limit = null; // grab
  const pageLimit = limit ?? (cached.pages.length > 1 ? cached.pages[0].items.length : null);

  // Dump everything in one page if no limit
  if (!pageLimit) {
    return {
      pages: [
        {
          items: updated,
          total: updated.length,
        },
      ],
      pageParams: [{ page: 0, offset: 0 }],
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
    pageParams: chunks.map((chunk, page) => ({ page, offset: chunk.length })),
  };
};

const isDetailsData = <T>(data: QueryData<T> | InfiniteQueryData<T>): data is QueryData<T> => {
  return 'items' in data;
};

const isListData = <T>(data: QueryData<T> | InfiniteQueryData<T>): data is InfiniteQueryData<T> => {
  return 'pages' in data;
};

// could do something interesting with options + mutation keys

export const useTableMutation = <N extends `${EntityType}s`, M extends MutationType, TVariables, TResult>({
  table,
  type,
  mutationFn,
}: {
  table: N;
  type: M;
  mutationFn: (args: TVariables) => Promise<TResult>;
}) => {
  const keyFilter: [N] = [table];

  const { t } = useTranslation();

  return useMutation({
    mutationFn,
    // at some point here, does shit get persisted locally?
    onMutate: async (variables, context): Promise<[QueryKey, unknown][]> => {
      const previous: [QueryKey, unknown][] = [];
      console.log('hi');
      const queries = context.client.getQueriesData<unknown>({ queryKey: keyFilter });
      for (const [queryKey, cached] of queries) {
        // Cancel outgoing refetches to avoid overwriting optimistic update
        await context.client.cancelQueries({ queryKey });

        // Snapshot the previous value
        if (!cached) {
          continue;
        }

        previous.push([queryKey, cached]);

        // const { order: insertOrder } = getQueryKeySortOrder(queryKey);

        // Optimistically update to the new value
        // @ts-expect-error
        context.client.setQueryData<QueryData<T> | InfiniteQueryData<T>>(queryKey, (prev) => {
          if (!prev) {
            return prev;
          }

          if (isDetailsData(prev)) {
            // @ts-expect-error
            return handleDetails(type, prev, variables);
          }

          if (isListData(prev)) {
            // @ts-expect-error
            return handleList(type, prev, variables);
          }
        });
      }

      // side effects

      // Return a result with the snapshotted value(s)
      return previous;
    },
    onError: (_error, _variables, onMutateResult, context) => {
      // maybe vary result based on if offline?
      console.error(_error);
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
