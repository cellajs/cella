import { queryOptions, useQuery } from '@tanstack/react-query';
import { getUser } from '~/api/users';
import Spinner from '~/modules/common/spinner';
import UserProfilePage from '~/modules/users/profile-page';

export const userQueryOptions = (idOrSlug: string) =>
  queryOptions({
    queryKey: ['user', idOrSlug],
    queryFn: () => getUser(idOrSlug),
  });

const UserSheet = ({ idOrSlug, orgIdOrSlug }: { idOrSlug: string; orgIdOrSlug?: string }) => {
  // Query members
  const { data: user, isError, isLoading } = useQuery(userQueryOptions(idOrSlug));

  // TODO show error message
  if (isError) {
    return null;
  }

  return isLoading ? (
    <div className="block">
      <Spinner className="h-10 w-10" />
    </div>
  ) : user ? (
    <UserProfilePage sheet user={user} orgIdOrSlug={orgIdOrSlug} />
  ) : null;
};

export default UserSheet;
