import { useSuspenseQuery } from '@tanstack/react-query';
import { Outlet, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { FocusViewContainer } from '~/modules/common/focus-view';
import { PageHeader } from '~/modules/common/page-header';
import { PageNav, type PageNavTab } from '~/modules/common/page-nav';
import { OrganizationRoute } from '~/routes/organizations';

import { Suspense, lazy } from 'react';
import { toast } from 'sonner';
import { useEventListener } from '~/hooks/use-event-listener';
import { queryClient } from '~/lib/router';
import { organizationQueryOptions } from '~/modules/organizations/query';
import { useUpdateOrganizationMutation } from '~/modules/organizations/update-organization-form';
import { useUserStore } from '~/store/user';

const LeaveButton = lazy(() => import('~/modules/organizations/leave-button'));

const organizationTabs: PageNavTab[] = [
  { id: 'members', label: 'common:members', path: '/$idOrSlug/members' },
  { id: 'attachments', label: 'common:attachments', path: '/$idOrSlug/attachments' },
  { id: 'settings', label: 'common:settings', path: '/$idOrSlug/settings' },
];

const OrganizationPage = () => {
  const { t } = useTranslation();
  const { idOrSlug } = useParams({ from: OrganizationRoute.id });
  const user = useUserStore((state) => state.user);

  const orgQueryOptions = organizationQueryOptions(idOrSlug);
  const cachedData = queryClient.getQueryData(orgQueryOptions.queryKey);
  const organization = cachedData ?? useSuspenseQuery(orgQueryOptions).data;

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
          organization.membership && (
            <Suspense>
              <LeaveButton organization={organization} />
            </Suspense>
          )
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
