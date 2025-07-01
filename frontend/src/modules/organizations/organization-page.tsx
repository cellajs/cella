import { useSuspenseQuery } from '@tanstack/react-query';
import { Outlet, useParams } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { FocusViewContainer } from '~/modules/common/focus-view';
import { PageHeader } from '~/modules/common/page/header';
import { PageNav, type PageTab } from '~/modules/common/page/nav';
import { toaster } from '~/modules/common/toaster';
import { organizationQueryOptions, useOrganizationUpdateMutation } from '~/modules/organizations/query';
import { OrganizationRoute } from '~/routes/organizations';
import { useUserStore } from '~/store/user';

const LeaveOrgButton = lazy(() => import('~/modules/organizations/leave-organization'));

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

  const { mutate } = useOrganizationUpdateMutation();

  const coverUpdateCallback = (bannerUrl: string) => {
    mutate(
      { idOrSlug: organization.slug, body: { bannerUrl } },
      {
        onSuccess: () => toaster(t('common:success.upload_cover'), 'success'),
        onError: () => toaster(t('error:image_upload_failed'), 'error'),
      },
    );
  };

  return (
    <>
      <PageHeader
        entity={organization}
        organizationId={organization.id}
        canUpdate={isAdmin}
        coverUpdateCallback={coverUpdateCallback}
        panel={
          organization.membership && (
            <Suspense>
              <LeaveOrgButton
                entity={organization}
                buttonProps={{
                  size: 'xs',
                  variant: 'ghost',
                  className: 'leading-normal cursor-pointer',
                }}
              />
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
