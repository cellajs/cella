import type { GetAttachmentsParams } from '~/api/attachments';
import type { GetMembersParams } from '~/api/memberships';

export const attachmentKeys = {
  all: () => ['attachments'] as const,
  lists: () => [...attachmentKeys.all(), 'list'] as const,
  list: (filters?: GetAttachmentsParams) => [...attachmentKeys.lists(), filters] as const,
  similar: (filters?: Pick<GetAttachmentsParams, 'orgIdOrSlug'>) => [...attachmentKeys.lists(), filters] as const,
  create: () => [...attachmentKeys.all(), 'create'] as const,
  update: () => [...attachmentKeys.all(), 'update'] as const,
  delete: () => [...attachmentKeys.all(), 'delete'] as const,
};

export const membersKeys = {
  all: () => ['members'] as const,
  list: (filters?: GetMembersParams) => [...membersKeys.all(), filters] as const,
  similar: (filters?: Pick<GetMembersParams, 'orgIdOrSlug' | 'idOrSlug' | 'entityType'>) => [...membersKeys.all(), filters] as const,
  update: () => [...membersKeys.all(), 'update'] as const,
  delete: () => [...membersKeys.all(), 'delete'] as const,
};
