import { useNavigate } from '@tanstack/react-router';
import { createContext } from 'react';

import type { User } from '~/types';

import { UserCog } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '~/modules/common/page-header';
import { useUserStore } from '~/store/user';
import ProjectsTable from '../projects/projects-table';
import { Button } from '../ui/button';

interface UserContextValue {
  user: User;
}

export const UserContext = createContext({} as UserContextValue);

export const UserProfile = ({ user, sheet }: { user: User; sheet?: boolean }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user: currentUser } = useUserStore();

  const isSelf = currentUser.id === user.id;

  const handleSettingCLick = () => {
    navigate({ to: '/user/settings', replace: true });
  };

  return (
    <>
      <UserContext.Provider value={{ user }}>
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
        <div className="container mb-12">
          <ProjectsTable sheet={sheet} userId={user.id} />
        </div>
      </UserContext.Provider>
    </>
  );
};
