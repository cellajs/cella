import { useSuspenseQuery } from '@tanstack/react-query';
import { Outlet } from '@tanstack/react-router';
import { Suspense, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FocusViewContainer } from '~/modules/common/focus-view';
import { PageHeader } from '~/modules/common/page/header';
import { PageTabNav } from '~/modules/common/page/tab-nav';
import { ScrollReset } from '~/modules/common/scroll-reset';
import { toaster } from '~/modules/common/toaster/toaster';
import { useResolveCan } from '~/modules/entities/use-resolve-can';
import { organizationQueryOptions, useOrganizationUpdateMutation } from '~/modules/organization/query';
import { lazyNamed } from '~/utils/lazy-named';

const LeaveOrgButton = lazyNamed(() => import('~/modules/organization/leave-organization'), 'LeaveOrgButton');

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
  const { data: organization } = useSuspenseQuery(orgQueryOptions);

  const resolveCan = useResolveCan();
  const canUpdate = resolveCan(organization.can?.organization?.update, organization.createdBy);

  // Grants for declarative tab gating: tabs declaring navTab.requires (settings) hide without them
  const grants = useMemo(() => (canUpdate ? ['update'] : []), [canUpdate]);

  const { mutate } = useOrganizationUpdateMutation();

  const coverUpdateCallback = (bannerUrl: string) => {
    mutate(
      { path: { tenantId: organization.tenantId, id: organization.id }, body: { bannerUrl } },
      {
        onSuccess: () => toaster.success(t('c:success.upload_cover')),
        onError: () => toaster.error(t('error:image_upload_failed')),
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
                channel={organization}
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
      <ScrollReset>
        <PageTabNav
          title={organization.name}
          avatar={organization}
          parentRouteId="/_app/$tenantId/$organizationSlug/organization"
          grants={grants}
        />
        <FocusViewContainer>
          <Outlet />
        </FocusViewContainer>
      </ScrollReset>
    </>
  );
}

export { OrganizationPage };
