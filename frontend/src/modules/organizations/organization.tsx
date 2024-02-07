import { useSuspenseQuery } from '@tanstack/react-query';
import { Outlet, useParams } from '@tanstack/react-router';
import { createContext } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { invite } from '~/api/general';
import { removeMemberFromOrganization } from '~/api/organizations';
import { useApiWrapper } from '~/hooks/use-api-wrapper';
import { PageHeader } from '~/modules/common/page-header';
import PageNav from '~/modules/common/page-nav';
import { Button } from '~/modules/ui/button';
import { organizationQueryOptions } from '~/router/routeTree';
import { useUserStore } from '~/store/user';
import { Organization } from '~/types';

interface OrganizationContextValue {
  organization: Organization;
}

const organizationTabs = [
  {
    name: 'Members',
    path: '/$organizationIdentifier/members',
  },
  {
    name: 'Settings',
    path: '/$organizationIdentifier/settings',
  },
];

export const OrganizationContext = createContext({} as OrganizationContextValue);

const OrganizationPage = () => {
  const user = useUserStore((state) => state.user);
  const { t } = useTranslation();
  const [apiWrapper] = useApiWrapper();
  const { organizationIdentifier }: { organizationIdentifier: string } = useParams({ strict: false });
  const organizationQuery = useSuspenseQuery(organizationQueryOptions(organizationIdentifier));
  const organization = organizationQuery.data;

  const onJoin = () => {
    apiWrapper(
      () => invite([user.email], organization.id),
      () => {
        organizationQuery.refetch();
        toast.success(
          t('success.you_joined_organization', {
            defaultValue: 'You have joined the organization',
          }),
        );
      },
    );
  };

  const onLeave = () => {
    apiWrapper(
      () => removeMemberFromOrganization(organizationIdentifier, user.id),
      () => {
        organizationQuery.refetch();
        toast.success(
          t('success.you_left_organization', {
            defaultValue: 'You have left the organization',
          }),
        );
      },
    );
  };

  return (
    <OrganizationContext.Provider value={{ organization }}>
      <PageHeader
        title={organization.name}
        type="organization"
        avatar={organization}
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
      <div className="container mt-4 flex-[1_1_0]">
        <Outlet />
      </div>
    </OrganizationContext.Provider>
  );
};

export default OrganizationPage;
