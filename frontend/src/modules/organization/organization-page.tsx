import { useSuspenseQuery } from '@tanstack/react-query';
import { Outlet } from '@tanstack/react-router';
import { lazy, Suspense, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '~/modules/common/page/header';
import { PageTabNav } from '~/modules/common/page/tab-nav';
import { toaster } from '~/modules/common/toaster/service';
import { organizationQueryOptions, useOrganizationUpdateMutation } from '~/modules/organization/query';
import type { EnrichedOrganization } from '~/modules/organization/types';
import { OrganizationRoute } from '~/routes/organization-routes';

const LeaveOrgButton = lazy(() => import('~/modules/organization/leave-organization'));

interface Props {
  organizationId: string;
  tenantId: string;
}

/**
 * Organization page with header, tab navigation and nested routes.
 */
function OrganizationPage({ organizationId, tenantId }: Props) {
  const { t } = useTranslation();

  const orgQueryOptions = organizationQueryOptions(organizationId, tenantId);
  // Organization is enriched with membership via cache subscription
  const { data: organization } = useSuspenseQuery(orgQueryOptions) as { data: EnrichedOrganization };

  const canUpdate = organization.can?.organization?.update ?? false;

  // Filter tabs based on permissions - users who can't update don't see settings
  const filterTabIds = useMemo(() => (canUpdate ? undefined : ['members', 'attachments']), [canUpdate]);

  const { mutate } = useOrganizationUpdateMutation();

  const coverUpdateCallback = (bannerUrl: string) => {
    mutate(
      { path: { tenantId: organization.tenantId, id: organization.id }, body: { bannerUrl } },
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
      <Outlet />
    </>
  );
}

export default OrganizationPage;
