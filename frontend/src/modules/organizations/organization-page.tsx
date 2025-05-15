import { useSuspenseQuery } from '@tanstack/react-query';
import { Outlet, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { FocusViewContainer } from '~/modules/common/focus-view';
import { PageHeader } from '~/modules/common/page/page-header';
import { PageNav, type PageTab } from '~/modules/common/page/page-nav';
import { OrganizationRoute } from '~/routes/organizations';

import { Suspense, lazy } from 'react';
import { toaster } from '~/modules/common/toaster';
import { organizationQueryOptions, useOrganizationUpdateMutation } from '~/modules/organizations/query';
import { useUserStore } from '~/store/user';

const LeaveButton = lazy(() => import('~/modules/organizations/leave-button'));

const organizationTabs: PageTab[] = [
  { id: 'members', label: 'common:members', path: '/organizations/$idOrSlug/members' },
  { id: 'attachments', label: 'common:attachments', path: '/organizations/$idOrSlug/attachments' },
  { id: 'settings', label: 'common:settings', path: '/organizations/$idOrSlug/settings' },
];

const OrganizationPage = () => {
  const { t } = useTranslation();
  const { idOrSlug } = useParams({ from: OrganizationRoute.id });
  const user = useUserStore((state) => state.user);

  const orgQueryOptions = organizationQueryOptions(idOrSlug);
  const { data: organization } = useSuspenseQuery(orgQueryOptions);

  const isAdmin = organization.membership?.role === 'admin' || user?.role === 'admin';
  const tabs = isAdmin ? organizationTabs : organizationTabs.slice(0, 2);

  // TODO(IMPROVE) can we do this in an better? In a generic entityPage store?
  const { mutate } = useOrganizationUpdateMutation();

  const coverUpdateCallback = (bannerUrl: string) => {
    mutate(
      { idOrSlug: organization.slug, json: { bannerUrl } },
      {
        onSuccess: () => toaster(t('common:success.upload_cover'), 'success'),
        onError: () => toaster(t('error:image_upload_failed'), 'error'),
      },
    );
  };

  return (
    <>
      <PageHeader
        id={organization.id}
        title={organization.name}
        type="organization"
        isAdmin={isAdmin}
        thumbnailUrl={organization.thumbnailUrl}
        bannerUrl={organization.bannerUrl}
        coverUpdateCallback={coverUpdateCallback}
        panel={
          organization.membership && (
            <Suspense>
              <LeaveButton organization={organization} />
            </Suspense>
          )
        }
      />
      <PageNav title={organization.name} avatar={organization} tabs={tabs} />
      <FocusViewContainer className="container min-h-screen">
        <Outlet />
      </FocusViewContainer>
    </>
  );
};

export default OrganizationPage;
