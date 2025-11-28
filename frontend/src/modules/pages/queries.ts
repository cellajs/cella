import { RegisteredRouter, UseSearchResult } from '@tanstack/router-core';
import { appConfig } from 'config';
import { GetPagesData, getPage, getPages, Page } from '~/api.gen';
import { parseBlocksText } from '~/lib/blocknote';
import { detailQueryOptions, detailsQueryOptions, listQueryOptions } from '~/query/utils/options';

type PagesQuery = Exclude<GetPagesData['query'], undefined>;

/** Pages request limit */
export const pagesLimit = appConfig.requestLimits.pages;
/** Pages accepted cutoff days */
// const ACCEPTED_CUTOFF_DAYS = 14;

/**
 * Pages query key factory
 * @see https://tkdodo.eu/blog/effective-react-query-keys#use-query-key-factories
 */
const pagesKeys = {
  all: ['pages'] as const,
  list: {
    base: () => [...pagesKeys.all, 'list'] as const,
    private: (query: PagesQuery) => [...pagesKeys.list.base(), query] as const,
    public: (query: PagesQuery) => [...pagesKeys.list.base(), 'public', query] as const,
  },
  details: {
    base: () => [...pagesKeys.all, 'details'] as const,
    private: (query: PagesQuery) => [...pagesKeys.details.base(), query] as const,
    public: (query: PagesQuery) => [...pagesKeys.details.base(), 'public', query] as const,
  },
  detail: {
    base: () => [...pagesKeys.all] as const,
    private: (id: string) => [...pagesKeys.details.base(), id] as const,
    public: (id: string) => [...pagesKeys.detail.base(), 'public', id] as const,
  },
  create: () => [...pagesKeys.all, 'create'] as const,
  update: () => [...pagesKeys.all, 'update'] as const,
  delete: () => [...pagesKeys.all, 'delete'] as const,
};

// #region Queries

/**
 *
 * @param id
 * @param orgIdOrSlug
 * @returns
 */
export const pageQueryOptions = (id: string, orgIdOrSlug?: string) => {
  return detailQueryOptions(
    {
      queryKey: orgIdOrSlug ? pagesKeys.detail.private(id) : pagesKeys.detail.public(id),
      queryFn: async () => {
        return await getPage({
          path: {
            id,
            // orgIdOrSlug,
          },
        });
      },
    },
    orgIdOrSlug,
  );
};

/**
 *
 * @param query
 * @param orgIdOrSlug
 * @returns
 */
export const pagesDetailsQueryOptions = (query: PagesQuery, orgIdOrSlug?: string) => {
  return detailsQueryOptions(
    {
      queryKey: orgIdOrSlug ? pagesKeys.details.private(query) : pagesKeys.details.public(query),
      queryFn: async () => {
        return await getPages({
          // path: { orgIdOrSlug },
          query: {
            offset: '0',
            limit: pagesLimit.toString(),
            // acceptedCutoff: ACCEPTED_CUTOFF_DAYS,
          },
        });
      },
    },
    orgIdOrSlug,
  );
};

type InfinitePagesQuery = Omit<PagesQuery, 'limit'> & {
  limit?: number;
};

export const pagesListQueryOptions = (
  { q = '', sort = 'createdAt', order = 'desc', limit = pagesLimit, offset }: InfinitePagesQuery,
  orgIdOrSlug?: string,
) => {
  const query: PagesQuery = {
    q,
    sort,
    order,
    limit: limit.toString(),
    offset,
  };

  return listQueryOptions(
    {
      queryKey: orgIdOrSlug ? pagesKeys.list.private(query) : pagesKeys.list.public(query),
      queryFn: async (params, signal) => {
        return await getPages({
          // path: { orgIdOrSlug },
          query: {
            limit: params.limit.toString(),
            offset: params.offset.toString(),
            ...query,
          },
          signal,
        });
      },
      limit: limit ?? pagesLimit,
    },
    orgIdOrSlug,
  );
};

// #endregion

// #region Helpers

/**
 *
 * @param query
 * @param item
 * @returns
 */
export const filterPages = (query: UseSearchResult<RegisteredRouter, undefined, false, unknown>, item: Page): boolean => {
  // Always allow empty search (or create flag?)
  if (!query.q) {
    return true;
  }

  // const { matchMode = 'all' } = query;
  const matchMode = 'all';

  const normalized = query.q.trim().toLowerCase();
  const raw = normalized.startsWith('=') ? normalized.slice(1) : normalized;

  const keywords = raw.split(/\s+/).filter(Boolean);

  // No filtering if there are no valid search keywords
  if (!keywords.length) {
    return true;
  }

  return [
    item.title.toLowerCase(),
    item.keywords.toLowerCase(),
    parseBlocksText(item.content),
    // match author
  ].some((item) => {
    return matchMode === 'all' ? item.includes(raw) : keywords.some((w) => item.includes(w));
  });
};

// #endregion

// #region Mutations

// const useCreate = <T>() => {
//   mutationOptions({
//     mutationKey: pagesKeys.create(),
//     mutationFn: (variables: T[]): Promise<T[]> => {},
//     onMutate: handleOnMutate(['pages'], 'create'),
//     onSuccess: () => {
//       // toaster();
//     },
//     onError: (_error, _variables, onMutateResult, context) => {
//       // maybe vary result based on if offline?

//       // toaster(t(`error:${type}_resource`, { resource: t(`app:${table}`) }), 'error');

//       if (!onMutateResult?.length) {
//         return;
//       }

//       for (const [queryKey, cached] of onMutateResult) {
//         context.client.setQueryData(queryKey, cached);
//       }
//     },
//     onSettled: handleOnSettled(['pages']),
//   })
// }

// #endregion
