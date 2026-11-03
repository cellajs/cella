import { appConfig } from 'shared';
import type { EnrichedChannel } from '~/modules/entities/types';
import { useCan } from '~/modules/entities/use-can';

/** Upload needs a channel in `attachmentUploadTargets` and an attachment create grant there: a channel update grant does not imply it. */
export function useCanUploadAttachments(channel: EnrichedChannel) {
  const can = useCan();
  return appConfig.attachmentUploadTargets.some((type) => type === channel.entityType) && can('create', 'attachment', channel);
}
