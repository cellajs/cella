import { appConfig } from 'shared';
import type { EnrichedChannel } from '~/modules/entities/types';

/** Upload needs a channel in `attachmentUploadTargets` and an attachment create grant, which a channel update grant does not imply. */
export function canUploadAttachments(channel: EnrichedChannel) {
  return appConfig.attachmentUploadTargets.some((type) => type === channel.entityType) && channel.can?.attachment?.create === true;
}
