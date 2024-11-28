import type { UseInfiniteQueryOptions, UseQueryOptions } from '@tanstack/react-query';

import { config } from 'config';
import { offlineFetch, offlineFetchInfinite } from '~/lib/query-client';
import type { InferType } from '~/modules/common/query-client-provider/types';
import { attachmentsQueryOptions } from '~/modules/organizations/attachments-table/helpers/query-options';
import { membersQueryOptions } from '~/modules/organizations/members-table/helpers/query-options';
import type { ContextEntity } from '~/types/common';

// biome-ignore lint/suspicious/noExplicitAny: any is used to infer the type of the options
export async function prefetchQuery<T extends UseQueryOptions<any, any, any, any>>(options: T): Promise<InferType<T>>;
// biome-ignore lint/suspicious/noExplicitAny: any is used to infer the type of the options
export async function prefetchQuery<T extends UseInfiniteQueryOptions<any, any, any, any>>(options: T): Promise<InferType<T>>;
export async function prefetchQuery(options: UseQueryOptions | UseInfiniteQueryOptions) {
  if ('getNextPageParam' in options) return offlineFetchInfinite(options);

  return offlineFetch(options);
}

export const prefetchMembers = async (
  item: {
    slug: string;
    entity: ContextEntity;
  },
  orgIdOrSlug: string,
) => {
  const membersOptions = membersQueryOptions({ idOrSlug: item.slug, orgIdOrSlug, entityType: item.entity, limit: config.requestLimits.members });
  prefetchQuery(membersOptions);
};

export const prefetchAttachments = async (orgIdOrSlug: string) => {
  const attachmentsOptions = attachmentsQueryOptions({ orgIdOrSlug, limit: config.requestLimits.attachments });
  prefetchQuery(attachmentsOptions);
};

export const waitFor = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
