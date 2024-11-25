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

const UserSheet = ({ idOrSlug, orgIdOrSlug }: { idOrSlug: string; orgIdOrSlug?: string }) => {
  const navigate = useNavigate();

  // Query members
  const { data: user } = useQuery(userQueryOptions(idOrSlug));

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

  if (!user) return null;
  return <UserProfilePage sheet user={user} orgIdOrSlug={orgIdOrSlug} />;
};

export default UserSheet;
