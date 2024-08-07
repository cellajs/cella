import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { Outlet, useParams } from '@tanstack/react-router';
import { getOrganization } from '~/api/organizations';
import { PageHeader } from '~/modules/common/page-header';
import { PageNav, type PageNavTab } from '~/modules/common/page-nav';
import { OrganizationRoute } from '~/routes/organizations';
import { FocusViewContainer } from '../common/focus-view';
import JoinLeaveButton from './join-leave-button';

const organizationTabs: PageNavTab[] = [
  { id: 'members', label: 'common:members', path: '/$idOrSlug/members' },
  { id: 'settings', label: 'common:settings', path: '/$idOrSlug/settings' },
];

export const organizationQueryOptions = (idOrSlug: string) =>
  queryOptions({
    queryKey: ['organizations', idOrSlug],
    queryFn: () => getOrganization(idOrSlug),
  });

const OrganizationPage = () => {
  const { idOrSlug } = useParams({ from: OrganizationRoute.id });
  const organizationQuery = useSuspenseQuery(organizationQueryOptions(idOrSlug));
  const organization = organizationQuery.data;
  const isAdmin = organization.membership?.role === 'admin';
  const tabs = isAdmin ? organizationTabs : [organizationTabs[0]];

  return (
    <>
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
      <PageNav title={organization.name} avatar={organization} tabs={tabs} />
      <FocusViewContainer className="container min-h-screen mt-4">
        <Outlet />
      </FocusViewContainer>
    </>
  );
};

export default OrganizationPage;
