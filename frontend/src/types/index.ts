import type { EntityType } from 'backend/types/common';
import type { config } from 'config';
import type { InferResponseType } from 'hono/client';
import type { generalClient, meClient, membershipsClient, organizationsClient, projectsClient, requestsClient, workspacesClient } from '~/api';

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

export type User = Extract<InferResponseType<(typeof meClient.index)['$get']>, { data: unknown }>['data'];

export type Organization = Extract<InferResponseType<(typeof organizationsClient.index)['$get']>, { data: unknown }>['data']['items'][number];

export type Request = Extract<InferResponseType<(typeof requestsClient.index)['$get']>, { data: unknown }>['data']['items'][number];

export type Workspace = Extract<InferResponseType<(typeof workspacesClient)[':idOrSlug']['$get']>, { data: unknown }>['data'];

export type Project = Extract<InferResponseType<(typeof projectsClient)[':idOrSlug']['$get']>, { data: unknown }>['data'];

export type ProjectList = Extract<InferResponseType<(typeof projectsClient.index)['$get']>, { data: unknown }>['data']['items'];

export type Member = Extract<InferResponseType<(typeof generalClient.members)['$get']>, { data: unknown }>['data']['items'][number];

export type Membership = Extract<InferResponseType<(typeof membershipsClient)[':id']['$put']>, { data: unknown }>['data'];

export type UserMenu = Extract<InferResponseType<(typeof meClient.menu)['$get']>, { data: unknown }>['data'];
