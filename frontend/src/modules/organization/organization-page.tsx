import { useSuspenseQuery } from '@tanstack/react-query';
import { Outlet } from '@tanstack/react-router';
import { lazy, Suspense, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FocusViewContainer } from '~/modules/common/focus-view';
import { PageHeader } from '~/modules/common/page/header';
import { PageTabNav } from '~/modules/common/page/tab-nav';
import { toaster } from '~/modules/common/toaster/service';
import { organizationQueryOptions, useOrganizationUpdateMutation } from '~/modules/organization/query';
import type { OrganizationWithMembership } from '~/modules/organization/types';
import { OrganizationRoute } from '~/routes/organization-routes';

const LeaveOrgButton = lazy(() => import('~/modules/organization/leave-organization'));

function OrganizationPage({ organizationId, tenantId }: { organizationId: string; tenantId: string }) {
  const { t } = useTranslation();

  const orgQueryOptions = organizationQueryOptions(organizationId, tenantId);
  // Organization is enriched with membership via cache subscription
  const { data: organization } = useSuspenseQuery(orgQueryOptions) as { data: OrganizationWithMembership };

  const canUpdate = organization.can?.update ?? false;

  // Filter tabs based on permissions - users who can't update don't see settings
  const filterTabIds = useMemo(() => (canUpdate ? undefined : ['members', 'attachments']), [canUpdate]);

  const { mutate } = useOrganizationUpdateMutation();

  // TODO research alternative pattern
  const coverUpdateCallback = (bannerUrl: string) => {
    mutate(
      { tenantId: organization.tenantId, id: organization.id, body: { bannerUrl } },
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
        canUpdate={canUpdate}
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
      <PageTabNav
        title={organization.name}
        avatar={organization}
        parentRouteId={OrganizationRoute.id}
        filterTabIds={filterTabIds}
      />
      <FocusViewContainer className="container min-h-screen">
        <Outlet />
      </FocusViewContainer>
    </>
  );
}

export default OrganizationPage;
