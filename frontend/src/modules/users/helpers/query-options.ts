import { queryOptions } from '@tanstack/react-query';
import { getAndSetMe, getAndSetMenu } from '~/modules/users/helpers';

export const meQueryOptions = () => {
  return queryOptions({
    queryKey: ['me'],
    queryFn: getAndSetMe,
  });
};

export const menuQueryOptions = () => {
  return queryOptions({
    queryKey: ['menu'],
    queryFn: getAndSetMenu,
  });
};
