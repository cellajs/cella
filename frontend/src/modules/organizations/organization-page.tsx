import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { Outlet, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { getOrganization } from '~/api/organizations';
import { FocusViewContainer } from '~/modules/common/focus-view';
import { PageHeader } from '~/modules/common/page-header';
import { PageNav, type PageNavTab } from '~/modules/common/page-nav';
import JoinLeaveButton from '~/modules/organizations/join-leave-button';
import { OrganizationRoute } from '~/routes/organizations';

import { toast } from 'sonner';
import { useEventListener } from '~/hooks/use-event-listener';
import { useUpdateOrganizationMutation } from '~/modules/organizations/update-organization-form';
import { useUserStore } from '~/store/user';

const organizationTabs: PageNavTab[] = [
  { id: 'members', label: 'common:members', path: '/$idOrSlug/members' },
  { id: 'attachments', label: 'common:attachments', path: '/$idOrSlug/attachments' },
  { id: 'settings', label: 'common:settings', path: '/$idOrSlug/settings' },
];

export const organizationQueryOptions = (idOrSlug: string) =>
  queryOptions({
    queryKey: ['organization', idOrSlug],
    queryFn: () => getOrganization(idOrSlug),
  });

const OrganizationPage = () => {
  const { t } = useTranslation();
  const { idOrSlug } = useParams({ from: OrganizationRoute.id });
  const user = useUserStore((state) => state.user);
  const organizationQuery = useSuspenseQuery(organizationQueryOptions(idOrSlug));
  const organization = organizationQuery.data;

  const isAdmin = organization.membership?.role === 'admin' || user?.role === 'admin';
  const tabs = isAdmin ? organizationTabs : organizationTabs.slice(0, 1);

  const { mutate } = useUpdateOrganizationMutation(organization.id);

  useEventListener('updateEntityCover', (e) => {
    const { bannerUrl, entity } = e.detail;
    if (entity !== organization.entity) return;
    mutate(
      { bannerUrl },
      {
        onSuccess: () => toast.success(t('common:success.upload_cover')),
        onError: () => toast.error(t('common:error.image_upload_failed')),
      },
    );
  });

  return (
    <>
      <PageHeader
        id={organization.id}
        title={organization.name}
        type="organization"
        isAdmin={isAdmin}
        thumbnailUrl={organization.thumbnailUrl}
        bannerUrl={organization.bannerUrl}
        panel={
          <div className="flex items-center p-2">
            <JoinLeaveButton organization={organization} />
          </div>
        }
      />
      <PageNav title={organization.name} avatar={organization} tabs={tabs} />
      <FocusViewContainer className="container min-h-screen mt-4 mb-[50vh]">
        <Outlet />
      </FocusViewContainer>
    </>
  );
};

export default OrganizationPage;
