import { useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';

import { queryOptions, useQuery } from '@tanstack/react-query';
import { getUser } from '~/api/users';
import { sheet } from '~/modules/common/sheeter/state';
import Spinner from '~/modules/common/spinner';
import UserProfilePage from '~/modules/users/profile-page';

export const userQueryOptions = (idOrSlug: string) =>
  queryOptions({
    queryKey: ['user', idOrSlug],
    queryFn: () => getUser(idOrSlug),
  });

const UserSheet = ({ idOrSlug, orgIdOrSlug }: { idOrSlug: string; orgIdOrSlug?: string }) => {
  const navigate = useNavigate();

  // Query members
  const { data: user, isError, isLoading } = useQuery(userQueryOptions(idOrSlug));

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

  useEffect(() => {
    if (!isError) return;
    sheet.remove(`user-preview-${idOrSlug}`);
  }, [isError]);

  return isLoading ? (
    <div className="block">
      <Spinner className="h-10 w-10" />
    </div>
  ) : user ? (
    <UserProfilePage sheet user={user} orgIdOrSlug={orgIdOrSlug} />
  ) : null;
};

export default UserSheet;
