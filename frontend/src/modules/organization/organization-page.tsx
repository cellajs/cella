import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { Outlet } from '@tanstack/react-router';
import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { isUnpublishedDraft } from 'shared';
import { FocusViewContainer } from '~/modules/common/focus-view';
import { PageHeader } from '~/modules/common/page/header';
import { PageTabNav } from '~/modules/common/page/tab-nav';
import { ScrollReset } from '~/modules/common/scroll-reset';
import { toaster } from '~/modules/common/toaster/toaster';
import { DraftBanner } from '~/modules/entities/draft-banner';
import { useCan } from '~/modules/entities/use-can';
import { useChannelTabOptions } from '~/modules/entities/use-channel-tab-options';
import { myMembershipsQueryOptions } from '~/modules/me/query';
import { PublishOrganizationForm } from '~/modules/organization/publish-organization-form';
import { organizationQueryOptions, useOrganizationUpdateMutation } from '~/modules/organization/query';
import { findMembership } from '~/query/enrichment/helpers';
import { lazyNamed } from '~/utils/lazy-named';

const JoinedButton = lazyNamed(() => import('~/modules/memberships/joined-button'), 'JoinedButton');

interface OrganizationPageProps {
  organizationId: string;
  tenantId: string;
}

export function OrganizationPage({ organizationId, tenantId }: OrganizationPageProps) {
  const { t } = useTranslation();

  const { data: organization } = useSuspenseQuery(organizationQueryOptions(organizationId, tenantId));
  const { data: myMemberships } = useQuery(myMembershipsQueryOptions());
  const membership = findMembership(myMemberships?.results ?? [], organization.id);

  const can = useCan();
  const canUpdate = can('update', 'organization', organization);
  const tabOptions = useChannelTabOptions(organization);

  const { mutate } = useOrganizationUpdateMutation();

  const updateCover = (bannerUrl: string) => {
    mutate(
      { path: { tenantId: organization.tenantId, organizationId: organization.id }, body: { bannerUrl } },
      { onSuccess: () => toaster.success(t('c:success.upload_cover')) },
    );
  };

  const deleteCover = () => {
    mutate(
      { path: { tenantId: organization.tenantId, organizationId: organization.id }, body: { bannerUrl: null } },
      { onSuccess: () => toaster.success(t('c:success.delete_resource', { resource: t('c:cover') })) },
    );
  };

  return (
    <>
      <PageHeader
        entity={organization}
        organizationId={organization.id}
        canUpdate={canUpdate}
        onCoverUpdate={updateCover}
        onCoverDelete={deleteCover}
        panel={
          membership && (
            <Suspense>
              <div className="flex items-center p-2">
                <JoinedButton channel={organization} role={membership.role} iconOnlyOnPhone />
              </div>
            </Suspense>
          )
        }
      />
      {isUnpublishedDraft(organization) && canUpdate && (
        <DraftBanner channel={organization} publishForm={(close) => <PublishOrganizationForm organization={organization} close={close} />} />
      )}
      <ScrollReset>
        <PageTabNav title={organization.name} avatar={organization} parentRouteId="/_app/$tenantId/$organizationSlug/organization" {...tabOptions} />
        <FocusViewContainer>
          <Outlet />
        </FocusViewContainer>
      </ScrollReset>
    </>
  );
}
