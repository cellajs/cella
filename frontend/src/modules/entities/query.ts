import { useMutation } from '@tanstack/react-query';
import i18n from 'i18next';
import { type ArchiveChannelData, type ArchiveChannelResponse, archiveChannel, unarchiveChannel } from 'sdk';
import type { ChannelEntityType } from 'shared';
import type { ApiError } from '~/lib/api';
import { toaster } from '~/modules/common/toaster/toaster';
import { channelOrganizationId } from '~/modules/entities/channel-organization-id';
import type { EnrichedChannel } from '~/modules/entities/types';
import { invalidateArchivedChannel } from '~/query/realtime/channel-archived';

/** The channel types the archive route takes: those below the organization, none in an app without them. */
type ArchivableChannelType = ArchiveChannelData['body']['channelType'];

const isArchivable = (channelType: ChannelEntityType): channelType is ArchivableChannelType => channelType !== 'organization';

interface ArchiveChannelVariables {
  channel: EnrichedChannel;
  /** The state to set: true archives, false unarchives. */
  archived: boolean;
  /** Also sets it on the channels inside it that the user may update. */
  includeDescendants: boolean;
}

/** Archives or unarchives a channel below the organization; the channels inside it the user may not update come back as `rejectedIds`. */
export const useArchiveChannelMutation = () =>
  useMutation<ArchiveChannelResponse, ApiError, ArchiveChannelVariables>({
    mutationKey: ['channel', 'archive'],
    mutationFn: ({ channel, archived, includeDescendants }) => {
      const { entityType } = channel;
      if (!isArchivable(entityType)) throw new Error('An organization is never archived: its tenant is');

      const path = { tenantId: channel.tenantId, organizationId: channelOrganizationId(channel) };
      const body = { channelType: entityType, channelId: channel.id, includeDescendants };
      return archived ? archiveChannel({ path, body }) : unarchiveChannel({ path, body });
    },
    onSuccess: ({ rejectedIds }, { channel, archived }) => {
      invalidateArchivedChannel(channel.id);
      const resource = i18n.t(`c:${channel.entityType}`);
      toaster.success(i18n.t(archived ? 'c:success.archive_resource' : 'c:success.unarchive_resource', { resource }));
      if (rejectedIds.length) toaster.warning(i18n.t('c:archive_rejected.text', { count: rejectedIds.length }));
    },
  });
