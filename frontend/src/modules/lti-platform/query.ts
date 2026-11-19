import { queryOptions, useMutation } from '@tanstack/react-query';
import { t } from 'i18next';
import {
  type ApproveLtiInstallationData,
  type ApproveLtiInstallationResponse,
  approveLtiInstallation,
  type CreateLtiResourceLinkData,
  type CreateLtiResourceLinkResponse,
  createLtiResourceLink,
  type DeleteLtiInstallationData,
  type DeleteLtiResourceLinkData,
  deleteLtiInstallation,
  deleteLtiResourceLink,
  type ListLtiTabsResponse,
  type LtiInstallation,
  type LtiResourceLink,
  listLtiInstallations,
  listLtiInstallationTabs,
  listLtiResourceLinks,
  listLtiTabs,
  type StartLtiLaunchData,
  type StartLtiLaunchResponse,
  type StartLtiToolRegistrationData,
  type StartLtiToolRegistrationResponse,
  startLtiLaunch,
  startLtiToolRegistration,
  type UpdateLtiInstallationData,
  type UpdateLtiInstallationResponse,
  type UpdateLtiResourceLinkData,
  type UpdateLtiResourceLinkResponse,
  type UpdateServiceAccountData,
  type UpdateServiceAccountResponse,
  updateLtiInstallation,
  updateLtiResourceLink,
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
  tabs: (tenantId: string, channelId?: string) => ['lti-platform', 'tabs', tenantId, ...(channelId ? [channelId] : [])] as const,
  resourceLinks: (tenantId: string, channelId?: string) => ['lti-platform', 'resource-links', tenantId, ...(channelId ? [channelId] : [])] as const,
  installationTabs: (tenantId: string, installationId?: string) =>
    ['lti-platform', 'installation-tabs', tenantId, ...(installationId ? [installationId] : [])] as const,
  startRegistration: ['lti-platform', 'start-registration'] as const,
  approve: ['lti-platform', 'approve'] as const,
  delete: ['lti-platform', 'delete'] as const,
  setStatus: ['lti-platform', 'set-status'] as const,
  update: ['lti-platform', 'update'] as const,
  createResourceLink: ['lti-platform', 'create-resource-link'] as const,
  updateResourceLink: ['lti-platform', 'update-resource-link'] as const,
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
    queryKey: ltiPlatformKeys.resourceLinks(channel.tenantId, channel.id),
    queryFn: () =>
      fetchAllPages(
        (page) => listLtiResourceLinks({ path: channelPath(channel), query: { ...page, channelType: channel.entityType, channelId: channel.id } }),
        syncChunkSize,
      ),
  });

/**
 * A channel's tabs of LTI tools, for a user who may update it: every approved LTI tool, a disabled one only where it has a
 * tab, oldest first, with its tab once placed.
 */
export const ltiTabsQueryOptions = (channel: ResourceLinkChannel) =>
  queryOptions({
    queryKey: ltiPlatformKeys.tabs(channel.tenantId, channel.id),
    queryFn: () =>
      fetchAllPages(
        (page) => listLtiTabs({ path: channelPath(channel), query: { ...page, channelType: channel.entityType, channelId: channel.id } }),
        syncChunkSize,
      ),
  });

/** Every tab of an installation in the organization, on or off, for an organization admin. */
export const ltiInstallationTabsQueryOptions = (path: QueryOrgContext, installationId: string) =>
  queryOptions({
    queryKey: ltiPlatformKeys.installationTabs(path.tenantId, installationId),
    queryFn: () =>
      fetchAllPages((page) => listLtiInstallationTabs({ path: { ...path, ltiInstallationId: installationId }, query: page }), syncChunkSize),
  });

type LtiTab = ListLtiTabsResponse['results'][number];

/**
 * Applies a resource link placed, switched or removed (`null`) to the cached tabs of its channel, its bar's and its card's,
 * and reads the admins' lists of tabs again.
 */
const setCachedResourceLink = (tenantId: string, channelId: string, linkId: string, link: LtiResourceLink | null) => {
  queryClient.setQueryData(ltiPlatformKeys.resourceLinks(tenantId, channelId), (oldData: QueryData<LtiResourceLink> | undefined) => {
    if (!oldData) return oldData;
    const results = oldData.results.some(({ id }) => id === linkId)
      ? oldData.results.flatMap((cached) => (cached.id !== linkId ? [cached] : link ? [link] : []))
      : [...oldData.results, ...(link ? [link] : [])];
    return { ...oldData, results, totalSize: results.length };
  });
  queryClient.setQueryData(ltiPlatformKeys.tabs(tenantId, channelId), (oldData: QueryData<LtiTab> | undefined) => {
    if (!oldData) return oldData;
    const results = oldData.results.map((tab) => {
      if (link ? tab.id !== link.installationId : tab.resourceLink?.id !== linkId) return tab;
      return { ...tab, resourceLink: link && { id: link.id, title: link.title, enabled: link.enabled, audience: link.audience } };
    });
    return { ...oldData, results };
  });
  queryClient.invalidateQueries({ queryKey: ltiPlatformKeys.installationTabs(tenantId) });
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
      queryClient.invalidateQueries({ queryKey: ltiPlatformKeys.tabs(path.tenantId) });
      toaster.success(t('c:success.approve_lti_tool', { name: approved.name }));
    },
  });

/** Deletes an installation in any state, asking the step-up an approval asks; its tabs leave every channel's bar and card. */
export const useDeleteLtiInstallationMutation = () =>
  useMutation<void, ApiError, MutationData<DeleteLtiInstallationData>>({
    mutationKey: ltiPlatformKeys.delete,
    mutationFn: async ({ path }) => {
      await withStepUp(() => deleteLtiInstallation({ path }));
    },
    onSuccess: (_, { path }) => {
      setCachedInstallation(path, path.ltiInstallationId, () => null);
      queryClient.invalidateQueries({ queryKey: ltiPlatformKeys.tabs(path.tenantId) });
      queryClient.invalidateQueries({ queryKey: ltiPlatformKeys.resourceLinks(path.tenantId) });
      queryClient.removeQueries({ queryKey: ltiPlatformKeys.installationTabs(path.tenantId, path.ltiInstallationId) });
      toaster.success(t('c:success.delete_resource', { resource: t('c:lti_tool') }));
    },
  });

/** Disables or enables an approved installation through its service account; enabling asks the step-up a new key asks. */
export const useSetLtiInstallationStatusMutation = () =>
  useMutation<UpdateServiceAccountResponse, ApiError, MutationData<UpdateServiceAccountData>>({
    mutationKey: ltiPlatformKeys.setStatus,
    mutationFn: ({ path, body }) => withStepUp(() => updateServiceAccount({ path, body })),
    onSuccess: ({ id, status, updatedAt }, { path }) => {
      setCachedInstallation(path, id, (installation) => ({ ...installation, status, updatedAt }));
      queryClient.invalidateQueries({ queryKey: ltiPlatformKeys.tabs(path.tenantId) });
    },
  });

/**
 * Replaces the access scopes an approved installation's own tokens may carry, or the channel types it may get a tab in;
 * asks the step-up an approval asks. The lists are read again after: they show a change another admin made meanwhile,
 * and the tabs a type taken away closed.
 */
export const useUpdateLtiInstallationMutation = () =>
  useMutation<UpdateLtiInstallationResponse, ApiError, MutationData<UpdateLtiInstallationData>>({
    mutationKey: ltiPlatformKeys.update,
    mutationFn: ({ path, body }) => withStepUp(() => updateLtiInstallation({ path, body })),
    onSuccess: (updated, { path, body }) => {
      setCachedInstallation(path, updated.id, () => updated);
      toaster.success(t('c:success.update_resource', { resource: t(body.channelTypes ? 'c:lti_tab_channel_types' : 'c:api_access') }));
    },
    onSettled: (_data, _error, { path }) => {
      queryClient.invalidateQueries({ queryKey: ltiPlatformKeys.installations(path) });
      queryClient.invalidateQueries({ queryKey: ltiPlatformKeys.tabs(path.tenantId) });
      queryClient.invalidateQueries({ queryKey: ltiPlatformKeys.resourceLinks(path.tenantId) });
      queryClient.invalidateQueries({ queryKey: ltiPlatformKeys.installationTabs(path.tenantId, path.ltiInstallationId) });
    },
  });

/** Places an approved installation as a tab of a channel, on; the channel's tab bar shows it at once. */
export const useCreateLtiResourceLinkMutation = () =>
  useMutation<CreateLtiResourceLinkResponse, ApiError, MutationData<CreateLtiResourceLinkData>>({
    mutationKey: ltiPlatformKeys.createResourceLink,
    mutationFn: ({ path, body }) => createLtiResourceLink({ path, body }),
    onSuccess: (link, { path }) => setCachedResourceLink(path.tenantId, link.channelId, link.id, link),
  });

/** Switches a tab on or off, changes whom it opens for or renames it; the resource link and its id stay. */
export const useUpdateLtiResourceLinkMutation = () =>
  useMutation<UpdateLtiResourceLinkResponse, ApiError, MutationData<UpdateLtiResourceLinkData>>({
    mutationKey: ltiPlatformKeys.updateResourceLink,
    mutationFn: ({ path, body }) => updateLtiResourceLink({ path, body }),
    onSuccess: (link, { path }) => setCachedResourceLink(path.tenantId, link.channelId, link.id, link),
  });

/** Removes a tab for good; `channelId` names the channel whose tabs drop it. */
export const useDeleteLtiResourceLinkMutation = () =>
  useMutation<void, ApiError, MutationData<DeleteLtiResourceLinkData> & { channelId: string }>({
    mutationKey: ltiPlatformKeys.deleteResourceLink,
    mutationFn: async ({ path }) => {
      await deleteLtiResourceLink({ path });
    },
    onSuccess: (_, { path, channelId }) => {
      setCachedResourceLink(path.tenantId, channelId, path.ltiResourceLinkId, null);
      // A disabled LTI tool leaves the channel's Tabs card with its last tab there
      queryClient.invalidateQueries({ queryKey: ltiPlatformKeys.tabs(path.tenantId, channelId) });
    },
  });

/** Starts a launch of a resource link; the frame that asked shows a failure in place. */
export const useStartLtiLaunchMutation = () =>
  useMutation<StartLtiLaunchResponse, ApiError, MutationData<StartLtiLaunchData>>({
    mutationKey: ltiPlatformKeys.startLaunch,
    mutationFn: ({ path }) => startLtiLaunch({ path }),
    meta: { suppressGlobalErrorToast: true },
    // A tab switched off or removed meanwhile: its channel's tabs are read again, which takes the page off it
    onError: (error, { path }) => {
      if (error.status === 404 || error.type === 'lti_tab_switched_off')
        queryClient.invalidateQueries({ queryKey: ltiPlatformKeys.resourceLinks(path.tenantId) });
    },
  });
