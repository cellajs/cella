import type { MembershipBase } from 'sdk';
import { meKeys } from '~/modules/me/query';
import { queryClient } from '~/query/query-client';

/** Null while memberships are not loaded. */
export const getCachedMemberships = (): MembershipBase[] | null =>
  queryClient.getQueryData<{ results: MembershipBase[] }>(meKeys.memberships)?.results ?? null;

export const findMembership = (memberships: MembershipBase[], entityId: string): MembershipBase | null =>
  memberships.find((membership) => membership.channelId === entityId) ?? null;
