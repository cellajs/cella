import { useSuspenseQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { Suspense } from 'react';
import { SlotTabHost } from '~/modules/common/page/slot-tab-host';
import { PageSpinner } from '~/modules/common/spinner';
import { useCan } from '~/modules/entities/use-can';
import { organizationQueryOptions } from '~/modules/organization/query';
import { lazyNamed } from '~/utils/lazy-named';

const OrganizationPage = lazyNamed(() => import('~/modules/organization/organization-page'), 'OrganizationPage');
const MembersTable = lazyNamed(() => import('~/modules/memberships/members-table/members-table'), 'MembersTable');
const AttachmentsTable = lazyNamed(() => import('~/modules/attachment/table/attachments-table'), 'AttachmentsTable');
const ChannelSettingsPage = lazyNamed(() => import('~/modules/entities/channel-settings-page'), 'ChannelSettingsPage');

const orgRouteApi = getRouteApi('/_app/$tenantId/$organizationSlug/organization');
const orgToolApi = getRouteApi('/_app/$tenantId/$organizationSlug/organization/$tool');
const embeddedOrgApi = getRouteApi('/embed/$tenantId/$organizationSlug');

function useRouteOrganization() {
  // Route context is rebuilt on every navigation, search-only ones included: select primitives so URL writes don't re-render the page.
  const organizationId = orgRouteApi.useRouteContext({ select: (context) => context.organization.id });
  const tenantId = orgRouteApi.useRouteContext({ select: (context) => context.tenantId });
  return useSuspenseQuery(organizationQueryOptions(organizationId, tenantId)).data;
}

export function OrganizationRouteComponent() {
  const organization = useRouteOrganization();
  return (
    <Suspense fallback={<PageSpinner />}>
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
    <Suspense fallback={<PageSpinner />}>
      <SlotTabHost slot="organization.tabs" toolId={tool} context={organization} />
    </Suspense>
  );
}

/** The organization's embedded page: the members its first tab shows, to a role that reads them, without the page around them. */
export function EmbeddedOrganizationComponent() {
  const organizationId = embeddedOrgApi.useRouteContext({ select: (context) => context.organization.id });
  const tenantId = embeddedOrgApi.useRouteContext({ select: (context) => context.tenantId });
  const { data: organization } = useSuspenseQuery(organizationQueryOptions(organizationId, tenantId));
  const can = useCan();
  return (
    <div className="container pt-4">
      <h1 className="mb-4 text-lg font-medium">{organization.name}</h1>
      {can('read', 'user', organization) && (
        <Suspense fallback={<PageSpinner />}>
          <MembersTable key={organization.id} channel={organization} />
        </Suspense>
      )}
    </div>
  );
}
