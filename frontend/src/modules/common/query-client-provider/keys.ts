import type { GetAttachmentsParams } from '~/api/attachments';

export const attachmentKeys = {
  all: () => ['attachments'] as const,
  lists: () => [...attachmentKeys.all(), 'list'] as const,
  list: (filters?: GetAttachmentsParams) => [...attachmentKeys.lists(), filters] as const,
  similar: (filters?: Pick<GetAttachmentsParams, 'orgIdOrSlug'>) => [...attachmentKeys.lists(), filters] as const,
  create: () => [...attachmentKeys.all(), 'create'] as const,
  update: () => [...attachmentKeys.all(), 'update'] as const,
  delete: () => [...attachmentKeys.all(), 'delete'] as const,
};
