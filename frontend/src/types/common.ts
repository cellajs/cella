import type { membersSchema } from 'backend/modules/general/schema';
import type { menuItemsSchema, userMenuSchema } from 'backend/modules/me/schema';
import type { membershipInfoSchema, membershipSchema } from 'backend/modules/memberships/schema';
import type { organizationSchema } from 'backend/modules/organizations/schema';
import type { requestSchema } from 'backend/modules/requests/schema';
import type { userSchema } from 'backend/modules/users/schema';
import type { config } from 'config';
import type { InferResponseType } from 'hono/client';
import type { z } from 'zod';
import type { client } from '~/api/me';
import type { EnabledOauthProviderOptions } from '#/types/common';

// Core types
export type Entity = (typeof config.entityTypes)[number];
export type ContextEntity = (typeof config.contextEntityTypes)[number];

export type User = z.infer<typeof userSchema>;
export type Session = Extract<InferResponseType<(typeof client.index)['$get']>, { data: unknown }>['data']['sessions'][number];
export type MeUser = User & { sessions: Session[]; passkey: boolean; oauth: EnabledOauthProviderOptions[] };
export type UserMenu = z.infer<typeof userMenuSchema>;
export type UserMenuItem = z.infer<typeof menuItemsSchema>[number];

export type Organization = z.infer<typeof organizationSchema>;

export type Language = Organization['languages'][number];

export type Member = z.infer<typeof membersSchema>;
export type Membership = z.infer<typeof membershipSchema>;
export type MinimumMembershipInfo = z.infer<typeof membershipInfoSchema>;

export type Request = z.infer<typeof requestSchema>;

export type MinimumEntityItem = {
  id: string;
  entity: ContextEntity;
  slug: string;
  name: string;
  thumbnailUrl: string | null;
  bannerUrl: string | null;
};

export type EntityPage = MinimumEntityItem & {
  organizationId?: string | null;
};

// Uppy and Imado upload types
export enum UploadType {
  Personal,
  Organization,
}
export interface UploadParams {
  public: boolean;
  organizationId?: string;
}

// Drag and drop data
export type DraggableItemData<T> = {
  type: string;
  item: T;
  itemType: Entity;
  dragItem: true;
  order: number;
};
