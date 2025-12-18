import { useSuspenseQuery } from '@tanstack/react-query';
import { Outlet } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { FocusViewContainer } from '~/modules/common/focus-view';
import { PageHeader } from '~/modules/common/page/header';
import { PageNav, type PageTab } from '~/modules/common/page/nav';
import { toaster } from '~/modules/common/toaster/service';
import { organizationQueryOptions, useOrganizationUpdateMutation } from '~/modules/organizations/query';
import { useUserStore } from '~/store/user';

const LeaveOrgButton = lazy(() => import('~/modules/organizations/leave-organization'));

const organizationTabs: PageTab[] = [
  { id: 'members', label: 'common:members', path: '/organization/$idOrSlug/members' },
  { id: 'attachments', label: 'common:attachments', path: '/organization/$idOrSlug/attachments' },
  { id: 'settings', label: 'common:settings', path: '/organization/$idOrSlug/settings' },
];

const OrganizationPage = ({ organizationId }: { organizationId: string }) => {
  const { t } = useTranslation();
  const systemRole = useUserStore((state) => state.systemRole);

  const orgQueryOptions = organizationQueryOptions(organizationId);
  const { data: organization } = useSuspenseQuery(orgQueryOptions);

  const isAdmin = organization.membership?.role === 'admin' || systemRole === 'admin';
  const tabs = isAdmin ? organizationTabs : organizationTabs.slice(0, 2);

  const { mutate } = useOrganizationUpdateMutation();

  const coverUpdateCallback = (bannerUrl: string) => {
    mutate(
      { idOrSlug: organization.id, body: { bannerUrl } },
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
