import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { Outlet } from '@tanstack/react-router';
import { Suspense, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FocusViewContainer } from '~/modules/common/focus-view';
import { PageHeader } from '~/modules/common/page/header';
import { PageTabNav } from '~/modules/common/page/tab-nav';
import { ScrollReset } from '~/modules/common/scroll-reset';
import { toaster } from '~/modules/common/toaster/toaster';
import { heldContextRoles } from '~/modules/entities/context-roles';
import { useResolveCan } from '~/modules/entities/use-resolve-can';
import { myMembershipsQueryOptions } from '~/modules/me/query';
import { organizationQueryOptions, useOrganizationUpdateMutation } from '~/modules/organization/query';
import { lazyNamed } from '~/utils/lazy-named';

const JoinedButton = lazyNamed(() => import('~/modules/memberships/joined-button'), 'JoinedButton');

interface Props {
  organizationId: string;
  tenantId: string;
}

function OrganizationPage({ organizationId, tenantId }: Props) {
  const { t } = useTranslation();

  const orgQueryOptions = organizationQueryOptions(organizationId, tenantId);
  // Organization is enriched with membership via cache subscription
  const { data: organization } = useSuspenseQuery(orgQueryOptions);

  const resolveCan = useResolveCan();
  const canUpdate = resolveCan(organization.can?.organization?.update, organization.createdBy);

  // Grants for declarative tab gating: tabs declaring navTab.requires (settings) hide without them
  const grants = useMemo(() => (canUpdate ? ['update'] : []), [canUpdate]);

  // Context-role pairs and channel arrangement for registry tabs (visibleTo gating + order/hidden)
  const { data: myMemberships } = useQuery(myMembershipsQueryOptions());
  const pairs = heldContextRoles(organization, myMemberships?.items ?? []);
  const tabsConfig = organization.toolsConfig?.['organization.tabs'];

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
              <div className="flex items-center p-2">
                <JoinedButton channel={organization} role={organization.membership?.role} />
              </div>
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
          pairs={pairs}
          slotConfig={tabsConfig}
        />
        <FocusViewContainer>
          <Outlet />
        </FocusViewContainer>
      </ScrollReset>
    </>
  );
}

export { OrganizationPage };
