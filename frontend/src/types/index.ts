import type { PageResourceType } from 'backend/types/common';
import type { InferResponseType } from 'hono/client';
import type { membershipClient, organizationsClient, usersClient, workspaceClient } from '~/api';

export enum UploadType {
  Personal,
  Organization,
}

export interface UploadParams {
  public: boolean;
  organizationId?: string;
}

export enum UserRole {
  ADMIN = 'Admin',
  MEMBER = 'Member',
}

export interface Page {
  type: PageResourceType;
  id: string;
  slug: string;
  name: string;
  thumbnailUrl: string | null;
  archived: boolean;
  muted: boolean;
  role: keyof typeof UserRole | null;
}

export type User = Extract<InferResponseType<(typeof usersClient.me)['$get']>, { data: unknown }>['data'];

export type Organization = Extract<InferResponseType<(typeof organizationsClient.organizations)['$get']>, { data: unknown }>['data']['items'][number];

export type Workspace = Extract<InferResponseType<(typeof workspaceClient.workspaces)[':workspace']['$get']>, { data: unknown }>['data'];

export type Member = Extract<
  InferResponseType<(typeof organizationsClient.organizations)[':organization']['members']['$get']>,
  { data: unknown }
>['data']['items'][number];

export type Membership = Extract<
  InferResponseType<(typeof membershipClient)[':idOrSlug']['memberships'][':user']['$put']>,
  { data: unknown }
>['data'];

export type UserMenu = Extract<InferResponseType<(typeof usersClient.menu)['$get']>, { data: unknown }>['data'];
