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
  listLtiInstallations,
  listLtiResourceLinks,
  type RejectLtiInstallationData,
  rejectLtiInstallation,
  type StartLtiLaunchData,
  type StartLtiLaunchResponse,
  type StartLtiToolRegistrationData,
  type StartLtiToolRegistrationResponse,
  startLtiLaunch,
  startLtiToolRegistration,
  type UpdateServiceAccountData,
  type UpdateServiceAccountResponse,
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
import type { MutationData, QueryOrgContext } from '~/query/types';

/** A channel as its resource links are read: by its type and id, in its organization. */
export type ResourceLinkChannel = { id: string; entityType: ChannelEntityType; tenantId: string; organizationId?: string | null };

const ltiPlatformKeys = {
  installations: (path: QueryOrgContext) => ['lti-platform', 'installations', path.tenantId, path.organizationId] as const,
  resourceLinks: (channel: Pick<ResourceLinkChannel, 'id' | 'tenantId'>) => ['lti-platform', 'resource-links', channel.tenantId, channel.id] as const,
  startRegistration: ['lti-platform', 'start-registration'] as const,
  approve: ['lti-platform', 'approve'] as const,
  reject: ['lti-platform', 'reject'] as const,
  setStatus: ['lti-platform', 'set-status'] as const,
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

/** The LTI resource links placed in a channel, in creation order; the channel's tabs list them too. */
export const ltiResourceLinksQueryOptions = (channel: ResourceLinkChannel) => ({
  queryKey: ltiPlatformKeys.resourceLinks(channel),
  queryFn: () =>
    fetchAllPages(
      (page) =>
        listLtiResourceLinks({
          path: { tenantId: channel.tenantId, organizationId: channelOrganizationId(channel) },
          query: { ...page, channelType: channel.entityType, channelId: channel.id },
        }),
      syncChunkSize,
    ),
});

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
    },
  });

/** Places an approved installation as a tab of a channel; the channel's tab bar reads the new link. */
export const useCreateLtiResourceLinkMutation = () =>
  useMutation<CreateLtiResourceLinkResponse, ApiError, MutationData<CreateLtiResourceLinkData>>({
    mutationKey: ltiPlatformKeys.createResourceLink,
    mutationFn: ({ path, body }) => createLtiResourceLink({ path, body }),
    onSuccess: (link, { path }) => {
      queryClient.invalidateQueries({ queryKey: ltiPlatformKeys.resourceLinks({ id: link.channelId, tenantId: path.tenantId }) });
      toaster.success(t('c:success.add_resource', { resource: t('c:tab') }));
    },
  });

/** Removes a resource link; `channelId` names the channel whose tab bar drops it. */
export const useDeleteLtiResourceLinkMutation = () =>
  useMutation<void, ApiError, MutationData<DeleteLtiResourceLinkData> & { channelId: string }>({
    mutationKey: ltiPlatformKeys.deleteResourceLink,
    mutationFn: async ({ path }) => {
      await deleteLtiResourceLink({ path });
    },
    onSuccess: (_, { path, channelId }) => {
      queryClient.invalidateQueries({ queryKey: ltiPlatformKeys.resourceLinks({ id: channelId, tenantId: path.tenantId }) });
    },
  });

/** Starts a launch of a resource link; the frame that asked shows a failure in place. */
export const useStartLtiLaunchMutation = () =>
  useMutation<StartLtiLaunchResponse, ApiError, MutationData<StartLtiLaunchData>>({
    mutationKey: ltiPlatformKeys.startLaunch,
    mutationFn: ({ path }) => startLtiLaunch({ path }),
    meta: { suppressGlobalErrorToast: true },
  });
