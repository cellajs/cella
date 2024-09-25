import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { QueryClientProvider as BaseQueryClientProvider } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { config } from 'config';
import { useEffect } from 'react';
import { queryClient } from '~/lib/router';
import { membersQueryOptions } from './modules/organizations/members-table/helpers/query-options';
import { organizationQueryOptions } from './modules/organizations/organization-page';
import { getAndSetMe, getAndSetMenu } from './modules/users/helpers';
import { useGeneralStore } from './store/general';

const GC_TIME = 24 * 60 * 60 * 1000; // 24 hours

const localStoragePersister = createSyncStoragePersister({
  storage: config.mode === 'production' ? window.localStorage : window.sessionStorage,
});

const entityQueryOptions = {
  organization: organizationQueryOptions,
} as const;

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
            const entityOptions = entityQueryOptions[item.entity](item.slug);
            // Invalidate and prefetch organization and members
            await queryClient.invalidateQueries({
              queryKey: entityOptions.queryKey,
            });
            queryClient.prefetchQuery({
              ...entityOptions,
              gcTime: GC_TIME,
            });
            const membersOptions = membersQueryOptions({ idOrSlug: item.slug, entityType: item.entity, limit: 40 });
            await queryClient.invalidateQueries({
              queryKey: membersOptions.queryKey,
            });
            queryClient.prefetchInfiniteQuery({
              ...membersOptions,
              gcTime: GC_TIME,
            });
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
