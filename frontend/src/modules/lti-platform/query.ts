import { queryOptions, useMutation } from '@tanstack/react-query';
import { t } from 'i18next';
import {
  type ApproveLtiInstallationData,
  type ApproveLtiInstallationResponse,
  approveLtiInstallation,
  type CreateLtiResourceLinkData,
  type CreateLtiResourceLinkResponse,
  createLtiResourceLink,
  type DeleteLtiResourceLinkData,
  deleteLtiResourceLink,
  type LtiInstallation,
  type LtiResourceLink,
  listLtiInstallationResourceLinks,
  listLtiInstallations,
  listLtiResourceLinks,
  listPlaceableLtiInstallations,
  type RejectLtiInstallationData,
  rejectLtiInstallation,
  type StartLtiLaunchData,
  type StartLtiLaunchResponse,
  type StartLtiToolRegistrationData,
  type StartLtiToolRegistrationResponse,
  startLtiLaunch,
  startLtiToolRegistration,
  type UpdateLtiInstallationData,
  type UpdateLtiInstallationResponse,
  type UpdateServiceAccountData,
  type UpdateServiceAccountResponse,
  updateLtiInstallation,
  updateServiceAccount,
} from 'sdk';
import type { ChannelEntityType } from 'shared';
import type { ApiError } from '~/lib/api';
import { withStepUp } from '~/modules/auth/step-up';
import { toaster } from '~/modules/common/toaster/toaster';
import { channelOrganizationId } from '~/modules/entities/channel-organization-id';
import { syncChunkSize } from '~/query/basic/entity-query-registry';
import { fetchAllPages } from '~/query/basic/fetch-all-pages';
import { queryClient } from '~/query/query-client';
import type { MutationData, QueryData, QueryOrgContext } from '~/query/types';

/** A channel as its resource links are read: by its type and id, in its organization. */
export type ResourceLinkChannel = { id: string; entityType: ChannelEntityType; tenantId: string; organizationId?: string | null };

const ltiPlatformKeys = {
  installations: (path: QueryOrgContext) => ['lti-platform', 'installations', path.tenantId, path.organizationId] as const,
  placeable: (tenantId: string, channelId?: string) => ['lti-platform', 'placeable', tenantId, ...(channelId ? [channelId] : [])] as const,
  resourceLinks: (channel: Pick<ResourceLinkChannel, 'id' | 'tenantId'>) => ['lti-platform', 'resource-links', channel.tenantId, channel.id] as const,
  installationResourceLinks: (tenantId: string, installationId?: string) =>
    ['lti-platform', 'installation-resource-links', tenantId, ...(installationId ? [installationId] : [])] as const,
  startRegistration: ['lti-platform', 'start-registration'] as const,
  approve: ['lti-platform', 'approve'] as const,
  reject: ['lti-platform', 'reject'] as const,
  setStatus: ['lti-platform', 'set-status'] as const,
  update: ['lti-platform', 'update'] as const,
  createResourceLink: ['lti-platform', 'create-resource-link'] as const,
  deleteResourceLink: ['lti-platform', 'delete-resource-link'] as const,
  startLaunch: ['lti-platform', 'start-launch'] as const,
};

/** The LTI tools installed in the organization's tenant, newest first. */
export const ltiInstallationsQueryOptions = (path: QueryOrgContext) =>
  queryOptions({
    queryKey: ltiPlatformKeys.installations(path),
    queryFn: () => fetchAllPages((page) => listLtiInstallations({ path, query: page }), syncChunkSize),
  });

/** The path a channel's LTI reads take: its tenant and organization. */
const channelPath = (channel: ResourceLinkChannel) => ({ tenantId: channel.tenantId, organizationId: channelOrganizationId(channel) });

/** The LTI resource links placed in a channel, in creation order: its tabs of LTI tools. */
export const ltiResourceLinksQueryOptions = (channel: ResourceLinkChannel) =>
  queryOptions({
    queryKey: ltiPlatformKeys.resourceLinks(channel),
    queryFn: () =>
      fetchAllPages(
        (page) => listLtiResourceLinks({ path: channelPath(channel), query: { ...page, channelType: channel.entityType, channelId: channel.id } }),
        syncChunkSize,
      ),
  });

/** The approved LTI tools a channel's tabs offer, for a user who may update it, oldest first. */
export const placeableLtiInstallationsQueryOptions = (channel: ResourceLinkChannel) =>
  queryOptions({
    queryKey: ltiPlatformKeys.placeable(channel.tenantId, channel.id),
    queryFn: () =>
      fetchAllPages(
        (page) =>
          listPlaceableLtiInstallations({ path: channelPath(channel), query: { ...page, channelType: channel.entityType, channelId: channel.id } }),
        syncChunkSize,
      ),
  });

/** Every channel of the organization where an installation has a tab, for an organization admin. */
export const ltiInstallationResourceLinksQueryOptions = (path: QueryOrgContext, installationId: string) =>
  queryOptions({
    queryKey: ltiPlatformKeys.installationResourceLinks(path.tenantId, installationId),
    queryFn: () =>
      fetchAllPages((page) => listLtiInstallationResourceLinks({ path: { ...path, ltiInstallationId: installationId }, query: page }), syncChunkSize),
  });

/** Applies a placed or removed link to the cached tabs of its channel, and reads the admins' lists of placed tabs again. */
const setCachedResourceLinks = (tenantId: string, channelId: string, update: (links: LtiResourceLink[]) => LtiResourceLink[]) => {
  queryClient.setQueryData(ltiPlatformKeys.resourceLinks({ id: channelId, tenantId }), (oldData: QueryData<LtiResourceLink> | undefined) => {
    if (!oldData) return oldData;
    const results = update(oldData.results);
    return { ...oldData, results, totalSize: results.length };
  });
  queryClient.invalidateQueries({ queryKey: ltiPlatformKeys.installationResourceLinks(tenantId) });
};

/** Replaces one installation in the organization's cached list. */
const setCachedInstallation = (path: QueryOrgContext, id: string, update: (installation: LtiInstallation) => LtiInstallation | null) =>
  queryClient.setQueryData(ltiInstallationsQueryOptions(path).queryKey, (oldData) => {
    if (!oldData) return oldData;
    const results = oldData.results.flatMap((installation) => {
      if (installation.id !== id) return [installation];
      const updated = update(installation);
      return updated ? [updated] : [];
    });
    return { ...oldData, results, totalSize: oldData.totalSize - (oldData.results.length - results.length) };
  });

/** Starts an LTI tool's registration: the answer is the address the registration frame opens. */
export const useStartLtiToolRegistrationMutation = () =>
  useMutation<StartLtiToolRegistrationResponse, ApiError, MutationData<StartLtiToolRegistrationData>>({
    mutationKey: ltiPlatformKeys.startRegistration,
    mutationFn: ({ path, body }) => withStepUp(() => startLtiToolRegistration({ path, body })),
  });

export const useApproveLtiInstallationMutation = () =>
  useMutation<ApproveLtiInstallationResponse, ApiError, MutationData<ApproveLtiInstallationData>>({
    mutationKey: ltiPlatformKeys.approve,
    mutationFn: ({ path, body }) => withStepUp(() => approveLtiInstallation({ path, body })),
    onSuccess: (approved, { path }) => {
      setCachedInstallation(path, approved.id, () => approved);
      queryClient.invalidateQueries({ queryKey: ltiPlatformKeys.placeable(path.tenantId) });
      toaster.success(t('c:success.approve_lti_tool', { name: approved.name }));
    },
  });

export const useRejectLtiInstallationMutation = () =>
  useMutation<void, ApiError, MutationData<RejectLtiInstallationData>>({
    mutationKey: ltiPlatformKeys.reject,
    mutationFn: async ({ path }) => {
      await withStepUp(() => rejectLtiInstallation({ path }));
    },
    onSuccess: (_, { path }) => {
      setCachedInstallation(path, path.ltiInstallationId, () => null);
    },
  });

/** Disables or enables an approved installation through its service account; enabling asks the step-up a new key asks. */
export const useSetLtiInstallationStatusMutation = () =>
  useMutation<UpdateServiceAccountResponse, ApiError, MutationData<UpdateServiceAccountData>>({
    mutationKey: ltiPlatformKeys.setStatus,
    mutationFn: ({ path, body }) => withStepUp(() => updateServiceAccount({ path, body })),
    onSuccess: ({ id, status, updatedAt }, { path }) => {
      setCachedInstallation(path, id, (installation) => ({ ...installation, status, updatedAt }));
      queryClient.invalidateQueries({ queryKey: ltiPlatformKeys.placeable(path.tenantId) });
    },
  });

/**
 * Replaces the access scopes an approved installation's own tokens may carry; asks the step-up an approval asks. The
 * list is read again after, so a change another admin made meanwhile shows too.
 */
export const useUpdateLtiInstallationMutation = () =>
  useMutation<UpdateLtiInstallationResponse, ApiError, MutationData<UpdateLtiInstallationData>>({
    mutationKey: ltiPlatformKeys.update,
    mutationFn: ({ path, body }) => withStepUp(() => updateLtiInstallation({ path, body })),
    onSuccess: (updated, { path }) => {
      setCachedInstallation(path, updated.id, () => updated);
      toaster.success(t('c:success.update_resource', { resource: t('c:api_access') }));
    },
    onSettled: (_data, _error, { path }) => {
      queryClient.invalidateQueries({ queryKey: ltiPlatformKeys.installations(path) });
      queryClient.invalidateQueries({ queryKey: ltiPlatformKeys.placeable(path.tenantId) });
    },
  });

/** Places an approved installation as a tab of a channel; the channel's tab bar shows it at once. */
export const useCreateLtiResourceLinkMutation = () =>
  useMutation<CreateLtiResourceLinkResponse, ApiError, MutationData<CreateLtiResourceLinkData>>({
    mutationKey: ltiPlatformKeys.createResourceLink,
    mutationFn: ({ path, body }) => createLtiResourceLink({ path, body }),
    onSuccess: (link, { path }) => setCachedResourceLinks(path.tenantId, link.channelId, (links) => [...links, link]),
  });

/** Removes a resource link; `channelId` names the channel whose tab bar drops it. */
export const useDeleteLtiResourceLinkMutation = () =>
  useMutation<void, ApiError, MutationData<DeleteLtiResourceLinkData> & { channelId: string }>({
    mutationKey: ltiPlatformKeys.deleteResourceLink,
    mutationFn: async ({ path }) => {
      await deleteLtiResourceLink({ path });
    },
    onSuccess: (_, { path, channelId }) =>
      setCachedResourceLinks(path.tenantId, channelId, (links) => links.filter((link) => link.id !== path.ltiResourceLinkId)),
  });

/** Starts a launch of a resource link; the frame that asked shows a failure in place. */
export const useStartLtiLaunchMutation = () =>
  useMutation<StartLtiLaunchResponse, ApiError, MutationData<StartLtiLaunchData>>({
    mutationKey: ltiPlatformKeys.startLaunch,
    mutationFn: ({ path }) => startLtiLaunch({ path }),
    meta: { suppressGlobalErrorToast: true },
  });
