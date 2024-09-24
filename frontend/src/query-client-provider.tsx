import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { QueryClientProvider as BaseQueryClientProvider, queryOptions } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { config } from 'config';
import { useEffect } from 'react';
import { queryClient } from '~/lib/router';
import { getMembers } from './api/general';
import { getOrganization } from './api/organizations';
import { getAndSetMe, getAndSetMenu } from './modules/users/helpers';
import { useGeneralStore } from './store/general';

const GC_TIME = 24 * 60 * 60 * 1000; // 24 hours

const localStoragePersister = createSyncStoragePersister({
  storage: config.mode === 'production' ? window.localStorage : window.sessionStorage,
});

export const QueryClientProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const { networkMode } = useGeneralStore();

  useEffect(() => {
    if (networkMode === 'offline') {
      (async () => {
        // Invalidate and prefetch me and menu
        await queryClient.invalidateQueries({
          queryKey: ['me'],
        });
        queryClient.prefetchQuery({
          queryKey: ['me'],
          queryFn: getAndSetMe,
          gcTime: GC_TIME,
        });
        await queryClient.invalidateQueries({
          queryKey: ['menu'],
        });
        const menu = await queryClient.fetchQuery({
          queryKey: ['menu'],
          queryFn: getAndSetMenu,
          gcTime: GC_TIME,
        });

        for (const section of Object.values(menu)) {
          for (const item of section) {
            const entityKey = `${item.entity}s`;
            // Invalidate and prefetch organization and members
            await queryClient.invalidateQueries({
              queryKey: [entityKey, item.id],
            });
            queryClient.prefetchQuery(
              queryOptions({
                queryKey: [entityKey, item.id],
                queryFn: () => getOrganization(item.id),
                gcTime: GC_TIME,
              }),
            );
            await queryClient.invalidateQueries({
              queryKey: ['members', item.id, item.entity],
            });
            queryClient.prefetchQuery(
              queryOptions({
                queryKey: ['members', item.id, item.entity],
                queryFn: async () =>
                  getMembers({
                    idOrSlug: item.id,
                    entityType: item.entity,
                  }),
                gcTime: GC_TIME,
              }),
            );
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
