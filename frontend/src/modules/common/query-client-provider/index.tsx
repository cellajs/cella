import type { UseQueryOptions } from '@tanstack/react-query';
import { QueryClientProvider as BaseQueryClientProvider } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useEffect } from 'react';
import { persister, queryClient } from '~/lib/router';
import { prefetchAttachments, prefetchMembers, prefetchQuery, waitFor } from '~/modules/common/query-client-provider/helpers';
import { getAndSetMe, getAndSetMenu } from '~/modules/users/helpers';
import { mapQuery, prefetchEntities } from '~/offline-config';
import { useGeneralStore } from '~/store/general';

const mutationFiles = import.meta.glob('./mutations/*');

// Dynamically import each file sequentially
(async () => {
  for (const importFunc of Object.values(mutationFiles)) await importFunc();
})();

const GC_TIME = 24 * 60 * 60 * 1000; // 24 hours

export const QueryClientProvider = ({ children }: { children: React.ReactNode }) => {
  const { networkMode } = useGeneralStore();

  useEffect(() => {
    if (networkMode === 'online') return;

    (async () => {
      await waitFor(1000); // wait for a second to avoid server overload

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

      for (const section of Object.values(menu)) {
        for (const item of section) {
          if (item.membership.archived) continue;

          const config = prefetchEntities[item.entity];
          const organizationId = item.organizationId || item.id;
          const options = mapQuery(item);
          prefetchQuery(options);
          if (config.prefetchMembers) prefetchMembers(item, organizationId);
          if (config.prefetchAttachments) prefetchAttachments(organizationId);
          await waitFor(1000); // wait for a second to avoid server overload

          for (const subItem of item.submenu ?? []) {
            if (subItem.membership.archived) continue;

            const config = prefetchEntities[subItem.entity];
            const options = mapQuery(subItem);

            const organizationId = subItem.organizationId || item.organizationId || item.id;
            prefetchQuery(options);
            if (config.prefetchMembers) prefetchMembers(subItem, organizationId);
            if (config.prefetchAttachments) prefetchAttachments(organizationId);
          }
        }
      }
    })();
  }, [networkMode]);

  if (networkMode === 'online') return <BaseQueryClientProvider client={queryClient}>{children}</BaseQueryClientProvider>;

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
