import { useSuspenseQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { Suspense } from 'react';
import { SlotTabHost } from '~/modules/common/page/slot-tab-host';
import { Spinner } from '~/modules/common/spinner';
import { organizationQueryOptions } from '~/modules/organization/query';
import { lazyNamed } from '~/utils/lazy-named';

const OrganizationPage = lazyNamed(() => import('~/modules/organization/organization-page'), 'OrganizationPage');
const MembersTable = lazyNamed(() => import('~/modules/memberships/members-table/members-table'), 'MembersTable');
const AttachmentsTable = lazyNamed(() => import('~/modules/attachment/table/attachments-table'), 'AttachmentsTable');
const ChannelSettingsPage = lazyNamed(() => import('~/modules/entities/channel-settings-page'), 'ChannelSettingsPage');

const orgRouteApi = getRouteApi('/_app/$tenantId/$organizationSlug/organization');
const orgToolApi = getRouteApi('/_app/$tenantId/$organizationSlug/organization/$tool');

function useRouteOrganization() {
  // Route context is rebuilt on every navigation, search-only ones included: select primitives so URL writes don't re-render the page.
  const organizationId = orgRouteApi.useRouteContext({ select: (c) => c.organization.id });
  const tenantId = orgRouteApi.useRouteContext({ select: (c) => c.tenantId });
  return useSuspenseQuery(organizationQueryOptions(organizationId, tenantId)).data;
}

export function OrganizationRouteComponent() {
  const organization = useRouteOrganization();
  return (
    <Suspense fallback={<Spinner size="lg" className="mt-[45vh]" />}>
      <OrganizationPage key={organization.id} organizationId={organization.id} tenantId={organization.tenantId} />
    </Suspense>
  );
}

export function OrganizationMembersComponent() {
  const organization = useRouteOrganization();
  return (
    <Suspense>
      <MembersTable key={organization.id} channel={organization} />
    </Suspense>
  );
}

export function OrganizationAttachmentsComponent() {
  const organization = useRouteOrganization();
  return (
    <Suspense>
      <AttachmentsTable key={organization.id} channel={organization} />
    </Suspense>
  );
}

export function OrganizationSettingsComponent() {
  const organization = useRouteOrganization();
  return (
    <Suspense>
      <ChannelSettingsPage entity={organization} />
    </Suspense>
  );
}

export function OrganizationToolComponent() {
  const organization = useRouteOrganization();
  const { tool } = orgToolApi.useParams();
  return (
    <Suspense fallback={<Spinner size="lg" className="mt-[45vh]" />}>
      <SlotTabHost slot="organization.tabs" toolId={tool} context={organization} />
    </Suspense>
  );
}
