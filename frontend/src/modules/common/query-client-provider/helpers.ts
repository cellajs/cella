import type { QueryKey, UseInfiniteQueryOptions, UseQueryOptions } from '@tanstack/react-query';

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

export const compareQueryKeys = (queryKey1: QueryKey, queryKey2: QueryKey): boolean => {
  if (queryKey1.length !== queryKey2.length) return false; // Different lengths, cannot be equal

  for (let i = 0; i < queryKey1.length; i++) {
    if (!deepEqual(queryKey1[i], queryKey2[i])) return false;
  }
  return true; // All elements match
};

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
const deepEqual = (value1: any, value2: any): boolean => {
  // Check if both values are the same reference
  if (value1 === value2) return true;

  // If either value is null or not an object, they're not equal
  if (value1 === null || value2 === null || typeof value1 !== 'object' || typeof value2 !== 'object') return false;

  // Check if both values are arrays
  if (Array.isArray(value1) !== Array.isArray(value2)) return false;

  // If both are arrays, compare each element recursively
  if (Array.isArray(value1)) {
    if (value1.length !== value2.length) return false;
    for (let i = 0; i < value1.length; i++) if (!deepEqual(value1[i], value2[i])) return false;
    return true;
  }

  // Otherwise, both values are objects, so compare their keys and values
  const keys1 = Object.keys(value1);
  const keys2 = Object.keys(value2);

  if (keys1.length !== keys2.length) return false;

  for (const key of keys1) if (!keys2.includes(key) || !deepEqual(value1[key], value2[key])) return false;

  return true;
};
