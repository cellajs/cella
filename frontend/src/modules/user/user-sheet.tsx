import { WifiOffIcon } from 'lucide-react';
import { useOnlineManager } from '~/hooks/use-online-manager';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import UserProfilePage from '~/modules/user/profile-page';

function UserSheet({ idOrSlug, orgIdOrSlug }: { idOrSlug: string; orgIdOrSlug?: string }) {
  const { isOnline } = useOnlineManager();

  return isOnline ? (
    <UserProfilePage idOrSlug={idOrSlug} orgIdOrSlug={orgIdOrSlug} isSheet />
  ) : (
    <ContentPlaceholder icon={WifiOffIcon} title="common:offline.text" />
  );
}

export default UserSheet;
