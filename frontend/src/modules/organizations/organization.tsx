import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { Outlet, useParams } from '@tanstack/react-router';
import { UserRoundCheck, UserRoundX } from 'lucide-react';
import { createContext } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { invite } from '~/api/general';
import { getOrganizationBySlugOrId, removeMembersFromOrganization } from '~/api/organizations';
import { useApiWrapper } from '~/hooks/use-api-wrapper';
import { PageHeader } from '~/modules/common/page-header';
import { PageNav, PageNavTab } from '~/modules/common/page-nav';
import { Button } from '~/modules/ui/button';
import { OrganizationRoute } from '~/router/routeTree';
import { useUserStore } from '~/store/user';
import type { Organization } from '~/types';

interface OrganizationContextValue {
  organization: Organization;
}

const organizationTabs: PageNavTab[] = [
  { id: 'members', label: 'member.plural', path: '/$organizationIdentifier/members' },
  { id: 'projects', label: 'project.plural', path: '/$organizationIdentifier/projects' },
  { id: 'settings', label: 'settings', path: '/$organizationIdentifier/settings' },
];

export const OrganizationContext = createContext({} as OrganizationContextValue);

export const organizationQueryOptions = (organizationIdentifier: string) =>
  queryOptions({
    queryKey: ['organizations', organizationIdentifier],
    queryFn: () => getOrganizationBySlugOrId(organizationIdentifier),
  });

const OrganizationPage = () => {
  const user = useUserStore((state) => state.user);
  const { t } = useTranslation();
  const [apiWrapper] = useApiWrapper();
  const { organizationIdentifier } = useParams({ from: OrganizationRoute.id });
  const organizationQuery = useSuspenseQuery(organizationQueryOptions(organizationIdentifier));
  const organization = organizationQuery.data;

  const onJoin = () => {
    apiWrapper(
      () => invite([user.email], organization.id),
      () => {
        organizationQuery.refetch();
        toast.success(t('common:success.you_joined_organization'));
      },
    );
  };

  const onLeave = () => {
    apiWrapper(
      () => removeMembersFromOrganization(organizationIdentifier, [user.id]),
      () => {
        organizationQuery.refetch();
        toast.success(t('common:success.you_left_organization'));
      },
    );
  };

  return (
    <OrganizationContext.Provider value={{ organization }}>
      <PageHeader
        id={organization.id}
        title={organization.name}
        type="organization"
        thumbnailUrl={organization.thumbnailUrl}
        bannerUrl={organization.bannerUrl}
        panel={
          <div className="flex items-center p-2">
            {organization.userRole ? (
              <Button size="sm" onClick={onLeave} aria-label="Leave">
                <UserRoundX size={16} />
                <span className="ml-1">{t('common:leave')}</span>
              </Button>
            ) : (
              <Button size="sm" onClick={onJoin} aria-label="Join">
                <UserRoundCheck size={16} />
                <span className="ml-1">{t('common:join')}</span>
              </Button>
            )}
          </div>
        }
      />
      <PageNav title={organization.name} avatar={organization} tabs={organizationTabs} />
      <div className="container min-h-screen mt-4">
        <Outlet />
      </div>
    </OrganizationContext.Provider>
  );
};

export default OrganizationPage;
