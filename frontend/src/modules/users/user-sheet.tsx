import { useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';

import { queryOptions, useQuery } from '@tanstack/react-query';
import { getUser } from '~/api/users';
import UserProfilePage from './profile-page';

export const userQueryOptions = (idOrSlug: string) =>
  queryOptions({
    queryKey: ['user', idOrSlug],
    queryFn: () => getUser(idOrSlug),
  });

const UserSheet = ({ idOrSlug }: { idOrSlug: string }) => {
  const navigate = useNavigate();

  // Query members
  const { data } = useQuery(userQueryOptions(idOrSlug));

  useEffect(() => {
    // Add search parameter on mount
    navigate({
      to: '.',
      replace: true,
      resetScroll: false,
      search: (prev) => ({
        ...prev,
        userIdPreview: idOrSlug,
      }),
    });

    // Cleanup function to remove search parameter on unmount
    return () => {
      navigate({
        to: '.',
        replace: true,
        resetScroll: false,
        search: (prev) => {
          const { userIdPreview, ...rest } = prev;
          return rest;
        },
      });
    };
  }, []);

  if (!data) return null;

  return <UserProfilePage sheet user={data} />;
};

export default UserSheet;
