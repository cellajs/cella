import type { GetAttachmentsParams } from '~/api/attachments';
import type { GetMembersParams } from '~/api/memberships';
import type { GetOrganizationsParams } from '~/api/organizations';
import type { GetRequestsParams } from '~/api/requests';
import type { GetUsersParams } from '~/api/users';

export const attachmentsKeys = {
  all: ['attachments'] as const,
  list: () => [...attachmentsKeys.all, 'list'] as const,
  table: (filters?: GetAttachmentsParams) => [...attachmentsKeys.list(), filters] as const,
  similar: (filters?: Pick<GetAttachmentsParams, 'orgIdOrSlug'>) => [...attachmentsKeys.list(), filters] as const,
  create: () => [...attachmentsKeys.all, 'create'] as const,
  update: () => [...attachmentsKeys.all, 'update'] as const,
  delete: () => [...attachmentsKeys.all, 'delete'] as const,
};

export const membersKeys = {
  all: ['members'] as const,
  list: () => [...membersKeys.all, 'list'] as const,
  table: (filters?: GetMembersParams) => [...membersKeys.list(), filters] as const,
  similar: (filters?: Pick<GetMembersParams, 'orgIdOrSlug' | 'idOrSlug' | 'entityType'>) => [...membersKeys.all, filters] as const,
  update: () => [...membersKeys.all, 'update'] as const,
  delete: () => [...membersKeys.all, 'delete'] as const,
};

export const requestsKeys = {
  all: ['requests'] as const,
  list: () => [...requestsKeys.all, 'list'] as const,
  table: (filters?: GetRequestsParams) => [...requestsKeys.list(), filters] as const,
};

export const usersKeys = {
  one: ['user'] as const,
  single: (idOrSlug: string) => [...usersKeys.one, idOrSlug] as const,
  many: ['users'] as const,
  list: () => [...usersKeys.many, 'list'] as const,
  table: (filters?: GetUsersParams) => [...usersKeys.list(), filters] as const,
};

export const organizationsKeys = {
  one: ['organization'] as const,
  single: (idOrSlug: string) => [...organizationsKeys.one, idOrSlug] as const,
  updateSingle: (idOrSlug: string) => [...organizationsKeys.one, 'update', idOrSlug] as const,
  many: ['organizations'] as const,
  list: () => [...organizationsKeys.many, 'list'] as const,
  table: (filters?: GetOrganizationsParams) => [...organizationsKeys.list(), filters] as const,
};

export const meKeys = {
  all: ['me'] as const,
  update: () => [...meKeys.all, 'update'] as const,
};

export const menuKeys = {
  all: ['menu'] as const,
};

export const searchKeys = {
  all: ['search'] as const,
  byValue: (value: string) => [...searchKeys.all, value] as const,
};
