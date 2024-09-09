import { useNavigate } from '@tanstack/react-router';
import { createContext } from 'react';

import type { User } from '~/types/common';

import { UserCog } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useEventListener } from '~/hooks/use-event-listener';
import { PageHeader } from '~/modules/common/page-header';
import { Button } from '~/modules/ui/button';
import { useUpdateUserMutation } from '~/modules/users/update-user-form';
import { useUserStore } from '~/store/user';

interface UserContextValue {
  user: Omit<User, 'counts'>;
}

export const UserContext = createContext({} as UserContextValue);

const UserProfilePage = ({ user, sheet }: { user: Omit<User, 'counts'>; sheet?: boolean }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user: currentUser, setUser } = useUserStore();

  const isSelf = currentUser.id === user.id;

  const { mutate } = useUpdateUserMutation(currentUser.id);

  const handleSettingCLick = () => {
    navigate({ to: '/user/settings', replace: true });
  };

  useEventListener('updateUserCover', (e) => {
    const banner = { bannerUrl: e.detail };
    mutate(banner, {
      onSuccess: () => {
        toast.success(t('common:success.upload_cover'));
        if (isSelf) setUser({ ...currentUser, ...banner });
      },
      onError: () => toast.error(t('common:error.image_upload_failed')),
    });
  });

  return (
    <>
      <UserContext.Provider value={{ user: user }}>
        <PageHeader
          id={user.id}
          title={user.name}
          type="user"
          disableScroll={true}
          thumbnailUrl={user.thumbnailUrl}
          bannerUrl={user.bannerUrl}
          panel={
            <>
              {isSelf && (
                <div className="max-xs:hidden flex items-center p-2">
                  <Button size="sm" onClick={handleSettingCLick} aria-label="Account">
                    <UserCog size={16} />
                    <span className="max-sm:hidden ml-1">{t('common:settings')}</span>
                  </Button>
                </div>
              )}
            </>
          }
        />

        {/* // TODO:generics issue: need a dynamic import solution for contents, perhaps using router */}
        <div className="container mb-[50vh]">

          Profile page content in {sheet ? 'sheet' : 'page'}

        </div>
      </UserContext.Provider>
    </>
  );
};

export default UserProfilePage;
