import { useSuspenseQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { createContext } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { invite } from '~/api/general';
import { removeMembersFromOrganization } from '~/api/organizations';
import { useApiWrapper } from '~/hooks/use-api-wrapper';
import { PageHeader } from '~/modules/common/page-header';
import PageNav from '~/modules/common/page-nav';
import { Button } from '~/modules/ui/button';
import { OrganizationRoute, organizationQueryOptions } from '~/router/routeTree';
import { useUserStore } from '~/store/user';
import { Organization } from '~/types';
import MembersTable from './members-table';
import OrganizationSettings from './organization-settings';

interface OrganizationContextValue {
  organization: Organization;
}

const organizationTabs = [
  { name: 'Members', path: '/$organizationIdentifier/members' },
  { name: 'Settings', path: '/$organizationIdentifier/settings' },
];

export const OrganizationContext = createContext({} as OrganizationContextValue);

const OrganizationPage = () => {
  const user = useUserStore((state) => state.user);
  const { t } = useTranslation();
  const [apiWrapper] = useApiWrapper();
  const { organizationIdentifier, tab } = useParams({ from: OrganizationRoute.id });
  const organizationQuery = useSuspenseQuery(organizationQueryOptions(organizationIdentifier));
  const organization = organizationQuery.data;

  const onJoin = () => {
    apiWrapper(
      () => invite([user.email], organization.id),
      () => {
        organizationQuery.refetch();
        toast.success(t('success.you_joined_organization'));
      },
    );
  };

  const onLeave = () => {
    apiWrapper(
      () => removeMembersFromOrganization(organizationIdentifier, [user.id]),
      () => {
        organizationQuery.refetch();
        toast.success(t('success.you_left_organization'));
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
              <Button size="sm" onClick={onLeave}>
                Leave
              </Button>
            ) : (
              <Button size="sm" onClick={onJoin}>
                Join
              </Button>
            )}
          </div>
        }
      />
      <PageNav title={organization.name} avatar={organization} tabs={organizationTabs} />
      <div className="container min-h-screen mt-4">{tab === 'members' ? <MembersTable /> : <OrganizationSettings />}</div>
    </OrganizationContext.Provider>
  );
};

export default OrganizationPage;
