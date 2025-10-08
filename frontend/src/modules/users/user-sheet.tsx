import { WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useOnlineManager } from '~/hooks/use-online-manager';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import UserProfilePage from '~/modules/users/profile-page';

const UserSheet = ({ idOrSlug, orgIdOrSlug }: { idOrSlug: string; orgIdOrSlug?: string }) => {
  const { t } = useTranslation();
  const { isOnline } = useOnlineManager();

  return isOnline ? (
    <UserProfilePage idOrSlug={idOrSlug} orgIdOrSlug={orgIdOrSlug} isSheet />
  ) : (
    <ContentPlaceholder icon={WifiOff} title={t(`${'common:offline.text'}`)} />
  );
};

export default UserSheet;
