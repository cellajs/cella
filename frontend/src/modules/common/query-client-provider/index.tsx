import type { UseInfiniteQueryOptions, UseQueryOptions } from '@tanstack/react-query';
import { QueryClientProvider as BaseQueryClientProvider } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useEffect } from 'react';
import { offlineFetch, offlineFetchInfinite } from '~/lib/query-client';
import { persister, queryClient } from '~/lib/router';
import { membersQueryOptions } from '~/modules/organizations/members-table/helpers/query-options';
import { organizationQueryOptions } from '~/modules/organizations/organization-page';
import { getAndSetMe, getAndSetMenu } from '~/modules/users/helpers';
import { useGeneralStore } from '~/store/general';
import type { ContextEntity } from '~/types/common';
import './attachments';

const GC_TIME = 24 * 60 * 60 * 1000; // 24 hours

type InferType<T> = T extends UseQueryOptions<infer D> ? D : T extends UseInfiniteQueryOptions<infer D> ? D : never;
// biome-ignore lint/suspicious/noExplicitAny: any is used to infer the type of the options
async function prefetchQuery<T extends UseQueryOptions<any, any, any, any>>(options: T): Promise<InferType<T>>;
// biome-ignore lint/suspicious/noExplicitAny: any is used to infer the type of the options
async function prefetchQuery<T extends UseInfiniteQueryOptions<any, any, any, any>>(options: T): Promise<InferType<T>>;
async function prefetchQuery(options: UseQueryOptions | UseInfiniteQueryOptions) {
  if ('getNextPageParam' in options) {
    return offlineFetchInfinite(options);
  }
  return offlineFetch(options);
}

const waitFor = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const prefetchMembers = async (
  item: {
    slug: string;
    entity: ContextEntity;
  },
  orgIdOrSlug: string,
) => {
  const membersOptions = membersQueryOptions({ idOrSlug: item.slug, orgIdOrSlug, entityType: item.entity, limit: 40 });
  prefetchQuery(membersOptions);
};

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

      // TODO can we make this dynamic by adding more props in an entity map?
      for (const section of Object.values(menu)) {
        for (const item of section) {
          if (item.entity === 'organization') {
            const options = organizationQueryOptions(item.slug);
            prefetchQuery(options);
            prefetchMembers(item, item.id);

            await waitFor(1000); // wait for a second to avoid server overload
          }
        }
      }
    })();
  }, [networkMode]);

  if (networkMode === 'online') {
    return <BaseQueryClientProvider client={queryClient}>{children}</BaseQueryClientProvider>;
  }

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
