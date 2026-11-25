import { appConfig, isSwitchOn } from 'shared';
import type { EnrichedChannel } from '~/modules/entities/types';
import { useCan } from '~/modules/entities/use-can';

/**
 * Upload needs attachments switched on, a channel in `attachmentUploadTargets` and an attachment create grant there: a
 * channel update grant does not imply it.
 */
export function useCanUploadAttachments(channel: EnrichedChannel) {
  const can = useCan();
  const targeted = appConfig.attachmentUploadTargets.some((type) => type === channel.entityType);
  return isSwitchOn({ product: 'attachment' }) && targeted && can('create', 'attachment', channel);
}
