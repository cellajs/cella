import { QueryClientProvider as BaseQueryClientProvider } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useEffect } from 'react';
import { persister, queryClient } from '~/lib/router';
import { meQueryOptions, menuQueryOptions } from '~/modules/users/query';
import type { UserMenuItem } from '~/modules/users/types';
import { queriesToMap } from '~/offline-config';
import { prefetchQuery, waitFor } from '~/query/helpers';
import { useGeneralStore } from '~/store/general';
import { useUserStore } from '~/store/user';

const queryMutationFileImports = import.meta.glob('~/modules/**/query-mutations.ts');

// Dynamically import each query mutation file sequentially
(async () => {
  for (const importQueryMutation of Object.values(queryMutationFileImports)) await importQueryMutation();
})();

const GC_TIME = 24 * 60 * 60 * 1000; // 24 hours

export const QueryClientProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useUserStore();
  const { offlineAccess } = useGeneralStore();

  useEffect(() => {
    // Exit early if offline access is disabled or no stored user is available
    if (!offlineAccess || !user) return;

    let isCancelled = false;

    (async () => {
      await waitFor(1000); // wait for a second to avoid server overload

      if (isCancelled) return;

      // Prefetch user data
      prefetchQuery({ ...meQueryOptions(), gcTime: GC_TIME });
      const menu = await prefetchQuery({ ...menuQueryOptions(), ...{ gcTime: GC_TIME } });

      if (!menu || isCancelled) return;

      // Recursively prefetch menu items
      const prefetchMenuItems = async (items: UserMenuItem[]) => {
        for (const item of items) {
          if (isCancelled) return;

          if (item.membership.archived) continue; // Skip this item but continue with others

          for (const query of queriesToMap(item)) {
            prefetchQuery(query);
            await waitFor(500);
            if (isCancelled) return;
          }

          if (item.submenu) await prefetchMenuItems(item.submenu);
        }
      };

      // Prefetching each menu section
      await Promise.all(Object.values(menu).map((section) => prefetchMenuItems(section as UserMenuItem[])));
    })();

    return () => {
      isCancelled = true;
    };
  }, [offlineAccess, user]);

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
