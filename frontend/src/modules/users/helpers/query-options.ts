import { queryOptions } from '@tanstack/react-query';
import { getAndSetMe, getAndSetMenu } from '~/modules/users/helpers';
import { meKeys, menuKeys } from '~/query/query-key-factories';

export const meQueryOptions = () => {
  return queryOptions({
    queryKey: meKeys.all,
    queryFn: getAndSetMe,
  });
};

export const menuQueryOptions = () => {
  return queryOptions({
    queryKey: menuKeys.all,
    queryFn: getAndSetMenu,
  });
};
