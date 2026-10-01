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
const OrganizationSettings = lazyNamed(() => import('~/modules/organization/organization-settings'), 'OrganizationSettings');

const orgRouteApi = getRouteApi('/_app/$tenantId/$organizationSlug/organization');
const orgMembersApi = getRouteApi('/_app/$tenantId/$organizationSlug/organization/members');
const orgAttachmentsApi = getRouteApi('/_app/$tenantId/$organizationSlug/organization/attachments');
const orgSettingsApi = getRouteApi('/_app/$tenantId/$organizationSlug/organization/settings');
const orgToolApi = getRouteApi('/_app/$tenantId/$organizationSlug/organization/$tool');

// Route context is rebuilt on every navigation, search-only ones included: select primitives so URL writes don't re-render the page.

export function OrganizationRouteComponent() {
  const organizationId = orgRouteApi.useRouteContext({ select: (c) => c.organization.id });
  const tenantId = orgRouteApi.useRouteContext({ select: (c) => c.tenantId });
  const { data } = useSuspenseQuery(organizationQueryOptions(organizationId, tenantId));
  return (
    <Suspense fallback={<Spinner className="mt-[45vh] h-10 w-10" />}>
      <OrganizationPage key={data.id} organizationId={data.id} tenantId={tenantId} />
    </Suspense>
  );
}

export function OrganizationMembersComponent() {
  const organizationId = orgMembersApi.useRouteContext({ select: (c) => c.organization.id });
  const tenantId = orgMembersApi.useRouteContext({ select: (c) => c.tenantId });
  const { data } = useSuspenseQuery(organizationQueryOptions(organizationId, tenantId));
  return (
    <Suspense>
      <MembersTable key={data.id} channel={data} />
    </Suspense>
  );
}

export function OrganizationAttachmentsComponent() {
  const organizationId = orgAttachmentsApi.useRouteContext({ select: (c) => c.organization.id });
  const tenantId = orgAttachmentsApi.useRouteContext({ select: (c) => c.tenantId });
  const { data } = useSuspenseQuery(organizationQueryOptions(organizationId, tenantId));
  return (
    <Suspense>
      <AttachmentsTable key={data.id} channel={data} />
    </Suspense>
  );
}

export function OrganizationSettingsComponent() {
  const organizationId = orgSettingsApi.useRouteContext({ select: (c) => c.organization.id });
  const tenantId = orgSettingsApi.useRouteContext({ select: (c) => c.tenantId });
  const { data } = useSuspenseQuery(organizationQueryOptions(organizationId, tenantId));
  return (
    <Suspense>
      <OrganizationSettings organization={data} />
    </Suspense>
  );
}

export function OrganizationToolComponent() {
  const organizationId = orgToolApi.useRouteContext({ select: (c) => c.organization.id });
  const tenantId = orgToolApi.useRouteContext({ select: (c) => c.tenantId });
  const { tool } = orgToolApi.useParams();
  const { data } = useSuspenseQuery(organizationQueryOptions(organizationId, tenantId));
  return (
    <Suspense fallback={<Spinner className="mt-[45vh] h-10 w-10" />}>
      <SlotTabHost slot="organization.tabs" toolId={tool} context={data} />
    </Suspense>
  );
}
