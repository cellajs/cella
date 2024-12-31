import { QueryClientProvider as BaseQueryClientProvider } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useEffect } from 'react';
import { persister, queryClient } from '~/lib/router';
import { meQueryOptions, menuQueryOptions } from '~/modules/users/query';
import { queriesToMap } from '~/offline-config';
import { prefetchQuery, waitFor } from '~/query/helpers';
import { useGeneralStore } from '~/store/general';
import type { UserMenuItem } from '~/types/common';

const mutationFiles = import.meta.glob('./mutations/*');

// Dynamically import each file sequentially
(async () => {
  for (const importFunc of Object.values(mutationFiles)) await importFunc();
})();

const GC_TIME = 24 * 60 * 60 * 1000; // 24 hours

export const QueryClientProvider = ({ children }: { children: React.ReactNode }) => {
  const { offlineAccess } = useGeneralStore();

  useEffect(() => {
    if (!offlineAccess) return;

    (async () => {
      await waitFor(1000); // wait for a second to avoid server overload

      // Prefetch the user and menu data
      const userQueryOptions = meQueryOptions();
      prefetchQuery({ ...userQueryOptions, ...{ gcTime: GC_TIME } });

      const userMenuQueryOptions = menuQueryOptions();
      const menu = await prefetchQuery({ ...userMenuQueryOptions, ...{ gcTime: GC_TIME } });

      const prefetchMenuItems = async (items: UserMenuItem[]) => {
        for (const item of items) {
          if (item.membership.archived) continue;

          // Prefetch queries for the item
          const queries = queriesToMap(item);
          for (const query of queries) {
            prefetchQuery(query);
            await waitFor(500);
          }

          if (item.submenu) await prefetchMenuItems(item.submenu);
        }
      };

      for (const section of Object.values(menu)) {
        await prefetchMenuItems(section);
      }
    })();
  }, [offlineAccess]);

  if (!offlineAccess) return <BaseQueryClientProvider client={queryClient}>{children}</BaseQueryClientProvider>;

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister }}
      onSuccess={() => {
        // resume mutations after initial restore from localStorage was successful
        queryClient.resumePausedMutations().then(() => {
          queryClient.invalidateQueries();
        });
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
};
