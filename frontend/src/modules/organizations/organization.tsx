import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { Outlet, useParams } from '@tanstack/react-router';
import { createContext } from 'react';
import { getOrganizationBySlugOrId } from '~/api/organizations';
import { PageHeader } from '~/modules/common/page-header';
import { PageNav, type PageNavTab } from '~/modules/common/page-nav';
import { OrganizationRoute } from '~/routes/organizations';
import type { Organization } from '~/types';
import { FocusViewContainer } from '../common/focus-view';
import JoinLeaveButton from './join-leave-button';

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
  const { organizationIdentifier } = useParams({ from: OrganizationRoute.id });
  const organizationQuery = useSuspenseQuery(organizationQueryOptions(organizationIdentifier));
  const organization = organizationQuery.data;

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
            <JoinLeaveButton organization={organization} />
          </div>
        }
      />
      <PageNav title={organization.name} avatar={organization} tabs={organizationTabs} />
      <FocusViewContainer className="container min-h-screen mt-4">
        <Outlet />
      </FocusViewContainer>
    </OrganizationContext.Provider>
  );
};

export default OrganizationPage;
