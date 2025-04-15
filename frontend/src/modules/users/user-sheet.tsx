import { useQuery } from '@tanstack/react-query';
import { FlameKindling, ServerCrash, WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useOnlineManager } from '~/hooks/use-online-manager';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import Spinner from '~/modules/common/spinner';
import { membersKeys } from '~/modules/memberships/query/options';
import { findUserFromCache } from '~/modules/users/helpers';
import UserProfilePage from '~/modules/users/profile-page';
import { userQueryOptions } from '~/modules/users/query';

const UserSheet = ({ idOrSlug, orgIdOrSlug }: { idOrSlug: string; orgIdOrSlug?: string }) => {
  const { t } = useTranslation();
  const { isOnline } = useOnlineManager();

  // Search for the user in cached queries
  const memberKey = [...membersKeys.table.base(), { orgIdOrSlug }];
  const cachedUser = findUserFromCache(memberKey, idOrSlug);

  const { data, isError, isLoading } = useQuery(userQueryOptions(idOrSlug));

  // Use the cached user if available, otherwise fallback to the server-fetched data
  const user = cachedUser || data;

  if (isError) return <ContentPlaceholder icon={ServerCrash} title={t('error:request_failed')} />;

  // Show a loading spinner if no cached user exists and data is still loading
  if (!cachedUser && isLoading) {
    return (
      <div className="block">
        <Spinner className="mt-[45vh] h-10 w-10" />
      </div>
    );
  }
  return user ? (
    <UserProfilePage isSheet user={user} orgIdOrSlug={orgIdOrSlug} />
  ) : (
    <ContentPlaceholder icon={isOnline ? FlameKindling : WifiOff} title={t(`${isOnline ? 'error:no_user_found' : 'common:offline.text'}`)} />
  );
};

export default UserSheet;
