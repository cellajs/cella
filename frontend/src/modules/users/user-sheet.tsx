import { useQuery } from '@tanstack/react-query';
import { FlameKindling, WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useOnlineManager } from '~/hooks/use-online-manager';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import Spinner from '~/modules/common/spinner';
import UserProfilePage from '~/modules/users/profile-page';
import { userQueryOptions } from '~/query/options/query-options';

const UserSheet = ({ idOrSlug, orgIdOrSlug }: { idOrSlug: string; orgIdOrSlug?: string }) => {
  const { t } = useTranslation();
  const { isOnline } = useOnlineManager();

  // Query members
  const { data: user, isError, isLoading } = useQuery(userQueryOptions(idOrSlug));

  // TODO show error message
  if (isError) return null;

  return isLoading ? (
    <div className="block">
      <Spinner className="h-10 w-10" />
    </div>
  ) : user ? (
    <UserProfilePage sheet user={user} orgIdOrSlug={orgIdOrSlug} />
  ) : (
    <ContentPlaceholder Icon={isOnline ? FlameKindling : WifiOff} title={t(`common:${isOnline ? 'error.no_user_found' : 'offline.text'}`)} />
  );
};

export default UserSheet;
