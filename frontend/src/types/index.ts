import { InferResponseType } from 'hono/client';
import { client } from '~/api/api';

// enum UserRole {
//   Student = 'student',
//   Staff = 'staff',
//   Owner = 'owner',
// }

export enum UploadType {
  Personal,
  Organization,
}

export interface UploadParams {
  public: boolean;
}

export enum UserRole {
  ADMIN = 'Admin',
  MEMBER = 'Member',
}

export interface Page {
  id: string;
  slug: string;
  name: string;
  thumbnailUrl: string | null;
  userRole: keyof typeof UserRole;
}

export type User = Extract<InferResponseType<(typeof client.me)['$get']>, { data: unknown }>['data'];

export type Organization = Extract<InferResponseType<(typeof client.organizations)['$get']>, { data: unknown }>['data']['items'][number];

export type Member = Extract<
  InferResponseType<(typeof client.organizations)[':organizationId']['members']['$get']>,
  { data: unknown }
>['data']['items'][number];

export type UserMenu = Extract<InferResponseType<(typeof client.menu)['$get']>, { data: unknown }>['data'];
