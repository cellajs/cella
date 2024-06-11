import { useNavigate } from '@tanstack/react-router';
import { createContext } from 'react';

import type { User } from '~/types';

import { UserCog } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '~/modules/common/page-header';
import { useUserStore } from '~/store/user';
import { Button } from '../ui/button';
import ProjectsTable from '../projects/projects-table';
import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { getProjects } from '~/api/projects';

interface UserContextValue {
  user: User;
}

export const UserContext = createContext({} as UserContextValue);

export const UserProfile = ({ user }: { user: User }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user: currentUser } = useUserStore();

  const projectsQuery = useSuspenseQuery(
    queryOptions({
      queryKey: ['projects'],
      queryFn: () => getProjects({ requestedUserId: user.id }),
    }),
  );
  const projects = projectsQuery.data.items;

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
          type="USER"
          thumbnailUrl={user.thumbnailUrl}
          bannerUrl={user.bannerUrl}
          panel={
            <>
              {isSelf && (
                <div className="flex items-center p-2">
                  <Button size="sm" onClick={handleSettingCLick} aria-label="Account settings">
                    <UserCog size={16} />
                    <span className="ml-1">{t('common:settings')}</span>
                  </Button>
                </div>
              )}
            </>
          }
        />
        <div className="container mt-4">
          <code>{JSON.stringify(user, null, 2)}</code>
          <ProjectsTable projects={projects} />
        </div>
      </UserContext.Provider>
    </>
  );
};
