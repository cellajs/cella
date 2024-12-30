import { infiniteQueryOptions } from '@tanstack/react-query';
import { config } from 'config';
import { attachmentsKeys, membersKeys, organizationsKeys, usersKeys } from '~/query/query-key-factories';

import { type GetAttachmentsParams, getAttachments } from '~/api/attachments';
import { type GetMembersParams, getMembers } from '~/api/memberships';
import { type GetOrganizationsParams, getOrganizations } from '~/api/organizations';
import { type GetUsersParams, getUsers } from '~/api/users';

export const usersQueryOptions = ({ q = '', sort: initialSort, order: initialOrder, role, limit = config.requestLimits.users }: GetUsersParams) => {
  const sort = initialSort || 'createdAt';
  const order = initialOrder || 'desc';

  const queryKey = usersKeys.table({ q, sort, order, role });

  return infiniteQueryOptions({
    queryKey,
    initialPageParam: 0,
    refetchOnWindowFocus: false,
    retry: 1,
    queryFn: async ({ pageParam: page, signal }) => await getUsers({ page, q, sort, order, role, limit, offset: page * limit }, signal),
    getNextPageParam: (_lastPage, allPages) => allPages.length,
  });
};

export const membersQueryOptions = ({
  idOrSlug,
  orgIdOrSlug,
  entityType,
  q = '',
  sort: initialSort,
  order: initialOrder,
  role,
  limit = config.requestLimits.members,
}: GetMembersParams) => {
  const sort = initialSort || 'createdAt';
  const order = initialOrder || 'desc';

  const queryKey = membersKeys.table({ idOrSlug, entityType, orgIdOrSlug, q, sort, order, role });

  return infiniteQueryOptions({
    queryKey,
    initialPageParam: 0,
    retry: 1,
    refetchOnWindowFocus: false,
    queryFn: async ({ pageParam: page, signal }) =>
      await getMembers({ page, q, sort, order, role, limit, idOrSlug, orgIdOrSlug, entityType, offset: page * limit }, signal),
    getNextPageParam: (_lastPage, allPages) => allPages.length,
  });
};

export const attachmentsQueryOptions = ({
  orgIdOrSlug,
  q = '',
  sort: initialSort,
  order: initialOrder,
  limit = config.requestLimits.attachments,
}: GetAttachmentsParams) => {
  const sort = initialSort || 'createdAt';
  const order = initialOrder || 'desc';

  const queryKey = attachmentsKeys.table({ orgIdOrSlug, q, sort, order });

  return infiniteQueryOptions({
    queryKey,
    initialPageParam: 0,
    retry: 1,
    refetchOnWindowFocus: false,
    queryFn: async ({ pageParam: page, signal }) => await getAttachments({ page, q, sort, order, limit, orgIdOrSlug, offset: page * limit }, signal),
    getNextPageParam: (_lastPage, allPages) => allPages.length,
  });
};

export const organizationsQueryOptions = ({
  q = '',
  sort: initialSort,
  order: initialOrder,
  limit = config.requestLimits.organizations,
}: GetOrganizationsParams) => {
  const sort = initialSort || 'createdAt';
  const order = initialOrder || 'desc';

  const queryKey = organizationsKeys.table({ q, sort, order });

  return infiniteQueryOptions({
    queryKey,
    initialPageParam: 0,
    retry: 1,
    refetchOnWindowFocus: false,
    queryFn: async ({ pageParam: page, signal }) => await getOrganizations({ page, q, sort, order, limit, offset: page * limit }, signal),
    getNextPageParam: (_lastPage, allPages) => allPages.length,
  });
};
