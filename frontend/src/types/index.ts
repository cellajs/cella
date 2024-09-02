import type { membersSchema } from 'backend/modules/general/schema';
import type { labelSchema } from 'backend/modules/labels/schema';
import type { menuItemsSchema, userMenuSchema } from 'backend/modules/me/schema';
import type { membershipSchema } from 'backend/modules/memberships/schema';
import type { organizationSchema } from 'backend/modules/organizations/schema';
import type { projectSchema } from 'backend/modules/projects/schema';
import type { requestsInfoSchema } from 'backend/modules/requests/schema';
import type { fullTaskSchema, subTaskSchema } from 'backend/modules/tasks/schema';
import type { userSchema } from 'backend/modules/users/schema';
import type { workspaceProjectSchema, workspaceSchema } from 'backend/modules/workspaces/schema';
import type { config } from 'config';
import type { InferResponseType } from 'hono/client';
import type { z } from 'zod';
import type { apiClient } from '~/api';

// Core types
export type Entity = (typeof config.entityTypes)[number];
export type ContextEntity = (typeof config.contextEntityTypes)[number];

type UsersOauth = (typeof config.oauthProviderOptions)[number][];
export type User = z.infer<typeof userSchema>;
export type Session = Extract<InferResponseType<(typeof apiClient)['me']['$get']>, { data: unknown }>['data']['sessions'][number];
export type MeUser = User & { sessions: Session[]; passkey: boolean; oauth: UsersOauth };
export type UserMenu = z.infer<typeof userMenuSchema>;
export type UserMenuItem = z.infer<typeof menuItemsSchema>[number];

export type Organization = z.infer<typeof organizationSchema>;

export enum UploadType {
  Personal,
  Organization,
}
export interface UploadParams {
  public: boolean;
  organizationId?: string;
}

// App-specific
export type Request = z.infer<typeof requestsInfoSchema>;

export type Member = z.infer<typeof membersSchema>;
export type Membership = z.infer<typeof membershipSchema>;

export type Workspace = z.infer<typeof workspaceSchema>;
export type WorkspaceStoreProject = z.infer<typeof workspaceProjectSchema>;

export type Project = z.infer<typeof projectSchema>;
export type Task = z.infer<typeof fullTaskSchema>;
export type SubTask = z.infer<typeof subTaskSchema>[number];
export type Label = z.infer<typeof labelSchema>;

export type MinimumEntityItem = {
  id: string;
  entity: ContextEntity;
  slug: string;
  name: string;
  thumbnailUrl?: string | null;
  bannerUrl?: string | null;
};
export type EntityPage = MinimumEntityItem & {
  organizationId?: string | null;
};
