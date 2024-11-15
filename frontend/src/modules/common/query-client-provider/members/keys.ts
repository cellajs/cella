import type { GetMembersParams } from '~/api/memberships';

// keys separate so org loader doesn't throw err
export const membersKeys = {
  all: () => ['members'] as const,
  list: (filters?: GetMembersParams) => [...membersKeys.all(), filters] as const,
  similar: (filters?: Pick<GetMembersParams, 'orgIdOrSlug' | 'idOrSlug' | 'entityType'>) => [...membersKeys.all(), filters] as const,
  update: () => [...membersKeys.all(), 'update'] as const,
  delete: () => [...membersKeys.all(), 'delete'] as const,
};