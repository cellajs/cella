import { useSuspenseQuery } from '@tanstack/react-query';
import { Outlet, useParams } from '@tanstack/react-router';
import { createContext } from 'react';
import { PageHeader } from '~/components/page-header';
import PageNav from '~/components/page-nav';
import { organizationQueryOptions } from '~/router/routeTree';
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
  const { organizationIdentifier } = useParams({ strict: false });
  const organizationQuery = useSuspenseQuery(organizationQueryOptions(organizationIdentifier));
  const organization = organizationQuery.data;

  return (
    <OrganizationContext.Provider value={{ organization }}>
      <PageHeader title={organization.name} type="organization" avatar={organization} bannerUrl={organization.bannerUrl} />
      <PageNav title={organization.name} avatar={organization} tabs={organizationTabs} />
      <div className="container mt-4 flex-[1_1_0]">
        <Outlet />
      </div>
    </OrganizationContext.Provider>
  );
};

export default OrganizationPage;
