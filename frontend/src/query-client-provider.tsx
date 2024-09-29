import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { QueryClientProvider as BaseQueryClientProvider, type UseInfiniteQueryOptions, type UseQueryOptions } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { config } from 'config';
import { useEffect } from 'react';
import { queryClient } from '~/lib/router';
import { membersQueryOptions } from './modules/organizations/members-table/helpers/query-options';
import { organizationQueryOptions } from './modules/organizations/organization-page';
import { tasksQueryOptions } from './modules/projects/board/board-column';
import { getAndSetMe, getAndSetMenu } from './modules/users/helpers';
import { workspaceQueryOptions } from './modules/workspaces/helpers/query-options';
import { useGeneralStore } from './store/general';
import type { ContextEntity } from './types/common';

const GC_TIME = 24 * 60 * 60 * 1000; // 24 hours

const localStoragePersister = createSyncStoragePersister({
  storage: config.mode === 'production' ? window.localStorage : window.sessionStorage,
});

type InferType<T> = T extends UseQueryOptions<infer D> ? D : T extends UseInfiniteQueryOptions<infer D> ? D : never;
// biome-ignore lint/suspicious/noExplicitAny: any is used to infer the type of the options
async function prefetchQuery<T extends UseQueryOptions<any, any, any, any>>(options: T): Promise<InferType<T>>;
// biome-ignore lint/suspicious/noExplicitAny: any is used to infer the type of the options
async function prefetchQuery<T extends UseInfiniteQueryOptions<any, any, any, any>>(options: T): Promise<InferType<T>>;
async function prefetchQuery(options: UseQueryOptions | UseInfiniteQueryOptions) {
  await queryClient.invalidateQueries({
    queryKey: options.queryKey,
  });
  if ('getNextPageParam' in options) {
    return queryClient.fetchInfiniteQuery({
      ...options,
      gcTime: GC_TIME,
    });
  }
  return queryClient.fetchQuery({
    ...options,
    gcTime: GC_TIME,
  });
}

const prefetchMembers = async (item: {
  slug: string;
  entity: ContextEntity;
}) => {
  const membersOptions = membersQueryOptions({ idOrSlug: item.slug, entityType: item.entity, limit: 40 });
  prefetchQuery(membersOptions);
};

export const QueryClientProvider = ({ children }: { children: React.ReactNode }) => {
  const { networkMode } = useGeneralStore();

  useEffect(() => {
    if (networkMode === 'offline') {
      (async () => {
        // Invalidate and prefetch me and menu
        const meQueryOptions: UseQueryOptions = {
          queryKey: ['me'],
          queryFn: getAndSetMe,
          gcTime: GC_TIME,
        };
        prefetchQuery(meQueryOptions);
        const menuQueryOptions = {
          queryKey: ['menu'],
          queryFn: getAndSetMenu,
          gcTime: GC_TIME,
        } satisfies UseQueryOptions;
        const menu = await prefetchQuery(menuQueryOptions);

        // TODO can we make this dynamic by adding more props in an entity map?
        for (const section of Object.values(menu)) {
          for (const item of section) {
            if (item.entity === 'organization') {
              const options = organizationQueryOptions(item.slug);
              prefetchQuery(options);
              prefetchMembers(item);
              continue;
            }

            if (item.entity === 'workspace') {
              const options = workspaceQueryOptions(item.slug, item.organizationId || item.slug);
              prefetchQuery(options);
              prefetchMembers(item);

              for (const subItem of item.submenu ?? []) {
                if (subItem.entity === 'project') {
                  const options = tasksQueryOptions({ projectId: subItem.id, orgIdOrSlug: item.organizationId || item.slug });
                  prefetchQuery(options);
                }
              }
            }
          }
        }
      })();
    }
  }, [networkMode]);

  if (networkMode === 'online') {
    return <BaseQueryClientProvider client={queryClient}>{children}</BaseQueryClientProvider>;
  }

  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={{ persister: localStoragePersister }}>
      {children}
    </PersistQueryClientProvider>
  );
};
