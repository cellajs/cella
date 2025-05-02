import { QueryClientProvider as BaseQueryClientProvider } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { config } from 'config';
import { useEffect } from 'react';
import { meQueryOptions, menuQueryOptions } from '~/modules/me/query';
import type { UserMenu, UserMenuItem } from '~/modules/me/types';
import { queriesToMap } from '~/offline-config';
import { waitFor } from '~/query/helpers';
import { prefetchQuery } from '~/query/helpers/prefetch-query';
import { persister } from '~/query/persister';
import { queryClient } from '~/query/query-client';
import { useUIStore } from '~/store/ui';
import { useUserStore } from '~/store/user';

const offlineQueryConfig = {
  gcTime: 24 * 60 * 60 * 1000, // Cache expiration time: 24 hours
  meta: {
    offlinePrefetch: true,
  },
};

export const QueryClientProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useUserStore();
  const { offlineAccess, toggleOfflineAccess } = useUIStore();

  // Disable offline access if PWA is not enabled in the config
  if (!config.has.pwa && offlineAccess) toggleOfflineAccess();

  useEffect(() => {
    // Exit early if offline access is disabled or no stored user is available
    if (!offlineAccess || !user) return;

    let isCancelled = false; // to handle the cancellation

    (async () => {
      await waitFor(1000); // Avoid overloading server with requests
      if (isCancelled) return; // If request was aborted, exit early

      // Prefetch menu and user details
      const [menuResponse]: PromiseSettledResult<UserMenu>[] = await Promise.allSettled([
        prefetchQuery({
          ...menuQueryOptions(),
          ...offlineQueryConfig,
        }),
        prefetchQuery({
          ...meQueryOptions(),
          ...offlineQueryConfig,
        }),
      ]);

      // If menu query failed or request was aborted, return early
      if (menuResponse.status !== 'fulfilled' || isCancelled) return;

      // Recursive function to prefetch menu items
      const prefetchMenuItems = async (items: UserMenuItem[]) => {
        for (const item of items) {
          if (isCancelled) return; // Check for abortion in each loop
          if (item.membership.archived) continue; // Skip archived items

          // Fetch queries for this menu item in parallel
          const queries = queriesToMap(item).map((query) =>
            prefetchQuery({
              ...query,
              ...offlineQueryConfig,
            }),
          );
          await Promise.allSettled(queries);

          await waitFor(500); // Avoid overloading server

          // Recursively prefetch submenu items if they exist
          if (item.submenu) await prefetchMenuItems(item.submenu);
        }
      };

      // Access menu data and start prefetching each menu section
      const menu = menuResponse.value;
      Object.values(menu).map(prefetchMenuItems); // Start prefetching for each menu section
    })();

    // Cleanup function to abort prefetch if component is unmounted
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
        // After successful cache restoration, resume paused mutations and invalidate queries
        queryClient.resumePausedMutations().then(() => queryClient.invalidateQueries());
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
};
