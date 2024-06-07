import type { EntityType } from 'backend/types/common';
import type { config } from 'config';
import type { InferResponseType } from 'hono/client';
import type { generalClient, membershipClient, organizationsClient, projectClient, usersClient, workspaceClient, requestsClient } from '~/api';

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

export type Role = (typeof config.systemRoles)[number] | (typeof config.entityRoles)[number];

export type Entity = (typeof config.entityTypes)[number];
export type ContextEntity = (typeof config.contextEntityTypes)[number];

export type User = Extract<InferResponseType<(typeof usersClient.me)['$get']>, { data: unknown }>['data'];

export type Organization = Extract<InferResponseType<(typeof organizationsClient.organizations)['$get']>, { data: unknown }>['data']['items'][number];

export type Request = Extract<InferResponseType<(typeof requestsClient.requests)['$get']>, { data: unknown }>['data']['items'][number];

export type Workspace = Extract<InferResponseType<(typeof workspaceClient.workspaces)[':workspace']['$get']>, { data: unknown }>['data'];

export type Project = Extract<InferResponseType<(typeof projectClient.projects)[':project']['$get']>, { data: unknown }>['data'];

export type ProjectList = Extract<InferResponseType<(typeof projectClient.projects)['$get']>, { data: unknown }>['data']['items'];

export type Member = Extract<InferResponseType<(typeof generalClient.members)['$get']>, { data: unknown }>['data']['items'][number];

export type Membership = Extract<InferResponseType<(typeof membershipClient)['memberships'][':membership']['$put']>, { data: unknown }>['data'];

export type UserMenu = Extract<InferResponseType<(typeof usersClient.me.menu)['$get']>, { data: unknown }>['data'];
