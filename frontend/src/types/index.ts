import type { EntityType } from 'backend/types/common';
import type { config } from 'config';
import type { InferResponseType } from 'hono/client';
import type { apiClient } from '~/api';
import type { Session } from '~/modules/users/user-settings';

export enum UploadType {
  Personal,
  Organization,
}

export interface UploadParams {
  public: boolean;
  organizationId?: string;
}

export type DraggableItemData<T> = {
  type: string;
  item: T;
  itemType: EntityType;
  dragItem: true;
  index: number;
};

export type Role = (typeof config.rolesByType.systemRoles)[number] | (typeof config.rolesByType.entityRoles)[number];

export type Entity = (typeof config.entityTypes)[number];
export type ContextEntity = (typeof config.contextEntityTypes)[number];

export type User = Extract<InferResponseType<(typeof apiClient.users)[':idOrSlug']['$get']>, { data: unknown }>['data'];

export type MeUser = User & { electricJWTToken: string; sessions: Session[] };

export type Organization = Extract<InferResponseType<(typeof apiClient.organizations)['$get']>, { data: unknown }>['data']['items'][number];

export type Request = Extract<InferResponseType<(typeof apiClient.requests)['$get']>, { data: unknown }>['data']['items'][number];

export type Workspace = Extract<InferResponseType<(typeof apiClient.workspaces)[':idOrSlug']['$get']>, { data: unknown }>['data'];

export type Project = Extract<InferResponseType<(typeof apiClient.projects)[':idOrSlug']['$get']>, { data: unknown }>['data'];

export type ProjectRow = Extract<InferResponseType<(typeof apiClient.projects)['$get']>, { data: unknown }>['data']['items'][number];

export type Member = Extract<InferResponseType<(typeof apiClient.members)['$get']>, { data: unknown }>['data']['items'][number];

export type Membership = Extract<InferResponseType<(typeof apiClient.memberships)[':id']['$put']>, { data: unknown }>['data'];

export type UserMenu = Extract<InferResponseType<(typeof apiClient.me.menu)['$get']>, { data: unknown }>['data'];

export type UserSubMenu = NonNullable<
  Extract<InferResponseType<(typeof apiClient.me.menu)['$get']>, { data: unknown }>['data']['organizations']['items'][number]['submenu']
>;
