import { useSuspenseQuery } from '@tanstack/react-query';
import { getRouteApi, Outlet } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';
import { Spinner } from '~/modules/common/spinner';
import { organizationQueryOptions } from '~/modules/organization/query';

const OrganizationPage = lazy(() => import('~/modules/organization/organization-page'));
const MembersTable = lazy(() => import('~/modules/memberships/members-table/members-table'));
const AttachmentsTable = lazy(() => import('~/modules/attachment/table/attachments-table'));
const OrganizationSettings = lazy(() => import('~/modules/organization/organization-settings'));

const orgRouteApi = getRouteApi('/appLayout/$tenantId/$organizationSlug/organization');
const orgMembersApi = getRouteApi('/appLayout/$tenantId/$organizationSlug/organization/members');
const orgAttachmentsApi = getRouteApi('/appLayout/$tenantId/$organizationSlug/organization/attachments');
const orgSettingsApi = getRouteApi('/appLayout/$tenantId/$organizationSlug/organization/settings');

export const OrganizationLayoutComponent = () => {
  return <Outlet />;
};

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
      <MembersTable key={data.id} contextEntity={data} />
    </Suspense>
  );
};

export const OrganizationAttachmentsComponent = () => {
  const { organization, tenantId } = orgAttachmentsApi.useRouteContext();
  const { data } = useSuspenseQuery(organizationQueryOptions(organization.id, tenantId));
  return (
    <Suspense>
      <AttachmentsTable canUpload={true} key={data.id} contextEntity={data} />
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
