import { QueryClientProvider as BaseQueryClientProvider } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useEffect } from 'react';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { persister, queryClient } from '~/lib/router';
import { meQueryOptions, menuQueryOptions } from '~/modules/users/query';
import type { UserMenuItem } from '~/modules/users/types';
import { queriesToMap } from '~/offline-config';
import { prefetchQuery } from '~/query/helpers/prefetch-query';
import { waitFor } from '~/query/helpers/wait-for';
import { useGeneralStore } from '~/store/general';
import { useMutationsStore } from '~/store/mutations';
import { useUserStore } from '~/store/user';

const queryMutationFileImports = import.meta.glob('~/modules/**/query-mutations.ts');

// Dynamically import each query mutation file sequentially
(async () => {
  for (const importQueryMutation of Object.values(queryMutationFileImports)) await importQueryMutation();
})();

const GC_TIME = 24 * 60 * 60 * 1000; // 24 hours

export const QueryClientProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useUserStore();
  const { isOnline } = useOnlineManager();
  const { offlineAccess } = useGeneralStore();
  const { setPausedMutations, getPausedMutations, clearPausedMutations } = useMutationsStore();

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

  useEffect(() => {
    const pausedMutations = getPausedMutations();
    if (!pausedMutations.length) return;
    console.info('App is back online, resuming paused mutations...');

    for (const mutation of pausedMutations) {
      const { mutationKey, variables, context } = mutation;
      const defaultMutation = queryClient.getMutationDefaults(mutationKey);

      if (!defaultMutation.mutationFn) continue;

      // Retry the mutation with stored variables and context
      defaultMutation
        .mutationFn(variables)
        .then((data) => defaultMutation.onSuccess?.(data, variables, context))
        .catch((err) => defaultMutation.onError?.(err, variables, context));
    }

    // Clear stored mutations and refresh queries
    clearPausedMutations();
    queryClient.invalidateQueries();
  }, []);

  useEffect(() => {
    if (!isOnline) return;
    // Listen to mutation cache changes
    const unsubscribe = queryClient.getMutationCache().subscribe((mutationEvent) => {
      const mutation = mutationEvent.mutation;
      // Store paused mutations if the app is offline
      if (mutation && 'action' in mutationEvent && mutationEvent.action.type === 'pause' && mutation.options.mutationKey) {
        setPausedMutations({
          mutationKey: mutation.options.mutationKey,
          variables: mutation.state.variables,
          context: mutation.state.context,
        });
      }
    });
    return () => unsubscribe(); // Cleanup
  }, [isOnline]);

  if (!offlineAccess) return <BaseQueryClientProvider client={queryClient}>{children}</BaseQueryClientProvider>;

  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={{ persister }}>
      {children}
    </PersistQueryClientProvider>
  );
};
