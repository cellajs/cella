import { queryOptions } from '@tanstack/react-query';

import { getOrganization } from '~/api/organizations';
import { getUser } from '~/api/users';

import { getAndSetMe, getAndSetMenu } from '~/modules/users/helpers';
import { meKeys, menuKeys, organizationsKeys, usersKeys } from '~/query/query-key-factories';

export const userQueryOptions = (idOrSlug: string) =>
  queryOptions({
    queryKey: usersKeys.single(idOrSlug),
    queryFn: () => getUser(idOrSlug),
  });

export const organizationQueryOptions = (idOrSlug: string) =>
  queryOptions({
    queryKey: organizationsKeys.single(idOrSlug),
    queryFn: () => getOrganization(idOrSlug),
  });

export const meQueryOptions = () =>
  queryOptions({
    queryKey: meKeys.all,
    queryFn: getAndSetMe,
  });

export const menuQueryOptions = () =>
  queryOptions({
    queryKey: menuKeys.all,
    queryFn: getAndSetMenu,
  });
