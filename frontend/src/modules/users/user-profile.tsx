import { useNavigate } from '@tanstack/react-router';
import { createContext, useState } from 'react';

import type { User } from '~/types';

import { UserCog } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useEventListener } from '~/hooks/use-event-listener';
import { PageHeader } from '~/modules/common/page-header';
import ProjectsTable from '~/modules/projects/projects-table';
import { Button } from '~/modules/ui/button';
import { useUpdateUserMutation } from '~/modules/users/update-user-form';
import { useUserStore } from '~/store/user';

interface UserContextValue {
  user: Omit<User, 'counts'>;
}

export const UserContext = createContext({} as UserContextValue);

export const UserProfile = ({ user, sheet }: { user: Omit<User, 'counts'>; sheet?: boolean }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user: currentUser } = useUserStore();
  const { mutate } = useUpdateUserMutation(currentUser.id);
  const [passedUser, setPassedUser] = useState(user);

  const isSelf = currentUser.id === passedUser.id;

  const handleSettingCLick = () => {
    navigate({ to: '/user/settings', replace: true });
  };

  useEventListener('updateUserCover', (e) => {
    const banner = { bannerUrl: e.detail };
    mutate(banner, {
      onSuccess: () => {
        toast.success(t('common:success.upload_cover'));
        setPassedUser((prev) => {
          return { ...prev, ...banner };
        });
      },
      onError: () => toast.error(t('common:error.image_upload_failed')),
    });
  });

  return (
    <>
      <UserContext.Provider value={{ user: passedUser }}>
        <PageHeader
          id={passedUser.id}
          title={passedUser.name}
          type="user"
          disableScroll={true}
          thumbnailUrl={passedUser.thumbnailUrl}
          bannerUrl={passedUser.bannerUrl}
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
        <div className="container mb-12">
          <ProjectsTable sheet={sheet} userId={isSelf ? undefined : passedUser.id} />
        </div>
      </UserContext.Provider>
    </>
  );
};
