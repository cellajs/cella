import { appConfig } from 'shared';
import type { EnrichedChannel } from '~/modules/entities/types';

/** Upload needs a channel in `attachmentUploadTargets` and an unconditional attachment create grant: a create has no row to resolve 'own' against, and a channel update grant does not imply it. */
export function canUploadAttachments(channel: EnrichedChannel) {
  return appConfig.attachmentUploadTargets.some((type) => type === channel.entityType) && channel.can?.attachment?.create === true;
}
