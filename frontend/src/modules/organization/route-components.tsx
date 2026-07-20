import { useSuspenseQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { Suspense } from 'react';
import { Spinner } from '~/modules/common/spinner';
import { organizationQueryOptions } from '~/modules/organization/query';
import { lazyNamed } from '~/utils/lazy-named';

const OrganizationPage = lazyNamed(() => import('~/modules/organization/organization-page'), 'OrganizationPage');
const MembersTable = lazyNamed(() => import('~/modules/memberships/members-table/members-table'), 'MembersTable');
const AttachmentsTable = lazyNamed(() => import('~/modules/attachment/table/attachments-table'), 'AttachmentsTable');
const OrganizationSettings = lazyNamed(
  () => import('~/modules/organization/organization-settings'),
  'OrganizationSettings',
);

const orgRouteApi = getRouteApi('/_app/$tenantId/$organizationSlug/organization');
const orgMembersApi = getRouteApi('/_app/$tenantId/$organizationSlug/organization/members');
const orgAttachmentsApi = getRouteApi('/_app/$tenantId/$organizationSlug/organization/attachments');
const orgSettingsApi = getRouteApi('/_app/$tenantId/$organizationSlug/organization/settings');

export const OrganizationRouteComponent = () => {
  const { organization, tenantId } = orgRouteApi.useRouteContext();
  const { data } = useSuspenseQuery(organizationQueryOptions(organization.id, tenantId));
  return (
    <Suspense fallback={<Spinner className="mt-[45vh] h-10 w-10" />}>
      <OrganizationPage key={data.id} organizationId={data.id} tenantId={tenantId} />
    </Suspense>
  );
};

export const OrganizationMembersComponent = () => {
  const { organization, tenantId } = orgMembersApi.useRouteContext();
  const { data } = useSuspenseQuery(organizationQueryOptions(organization.id, tenantId));
  return (
    <Suspense>
      <MembersTable key={data.id} channelEntity={data} />
    </Suspense>
  );
};

export const OrganizationAttachmentsComponent = () => {
  const { organization, tenantId } = orgAttachmentsApi.useRouteContext();
  const { data } = useSuspenseQuery(organizationQueryOptions(organization.id, tenantId));
  return (
    <Suspense>
      <AttachmentsTable key={data.id} channelEntity={data} />
    </Suspense>
  );
};

export const OrganizationSettingsComponent = () => {
  const { organization, tenantId } = orgSettingsApi.useRouteContext();
  const { data } = useSuspenseQuery(organizationQueryOptions(organization.id, tenantId));
  return (
    <Suspense>
      <OrganizationSettings organization={data} />
    </Suspense>
  );
};
