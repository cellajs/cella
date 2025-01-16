import type { UppyFile } from '@uppy/core';
import type { membersSchema } from 'backend/modules/general/schema';
import type { membershipInfoSchema, membershipSchema } from 'backend/modules/memberships/schema';
import type { invitesInfoSchema, organizationSchema } from 'backend/modules/organizations/schema';
import type { requestSchema } from 'backend/modules/requests/schema';
import type { limitedUserSchema, userSchema } from 'backend/modules/users/schema';
import type { config } from 'config';
import type { InferResponseType } from 'hono/client';
import type { Dispatch, SetStateAction } from 'react';
import type { SortColumn } from 'react-data-grid';
import type { z } from 'zod';
import type { UppyBody, UppyMeta } from '~/lib/imado';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/columns-view';
import type { meClient } from '~/modules/users/api';
import type { attachmentSchema } from '#/modules/attachments/schema';
import type { EnabledOauthProviderOptions } from '#/types/common';

// Core types
export type Entity = (typeof config.entityTypes)[number];
export type ContextEntity = (typeof config.contextEntityTypes)[number];
export type PageEntity = (typeof config.pageEntityTypes)[number];

export type User = z.infer<typeof userSchema>;
export type LimitedUser = z.infer<typeof limitedUserSchema>;

export type Session = Extract<InferResponseType<(typeof meClient.index)['$get']>, { data: unknown }>['data']['sessions'][number];
export type MeUser = User & { sessions: Session[]; passkey: boolean; oauth: EnabledOauthProviderOptions[] };
export type UserMenu = Extract<InferResponseType<(typeof meClient.menu)['$get']>, { data: unknown }>['data'];
export type UserMenuItem = UserMenu[keyof UserMenu][number];

export type Organization = z.infer<typeof organizationSchema>;
export type OrganizationInvitesInfo = z.infer<typeof invitesInfoSchema>;

export type Attachment = z.infer<typeof attachmentSchema>;

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
  membership: MinimumMembershipInfo | null;
  parentEntity?: { idOrSlug: string; entity: ContextEntity };
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

export type UploadedUppyFile = { file: UppyFile<UppyMeta, UppyBody>; url: string };

// Drag and drop data
export type DraggableItemData<T> = {
  type: string;
  item: T;
  itemType: Entity;
  dragItem: true;
  order: number;
};

export type BaseTableProps<T, K extends { q?: unknown; sort?: unknown; order?: unknown }> = {
  queryVars: BaseTableQueryVariables<K>;
  columns: ColumnOrColumnGroup<T>[];
  sortColumns: SortColumn[];
  setSortColumns: (sortColumns: SortColumn[]) => void;
  updateCounts: (selected: T[], total: number) => void;
};

export type BaseTableMethods = {
  clearSelection: () => void;
};

export type BaseTableQueryVariables<T extends { q?: unknown; sort?: unknown; order?: unknown }> = {
  q: T['q'] | undefined;
  sort: T['sort'] | undefined;
  order: T['order'] | undefined;
  limit: number | undefined;
};

export type BaseTableHeaderProps<T, K> = {
  total: number | undefined;
  selected: T[];
  q: string;
  setSearch: (newValues: Partial<K>, saveSearch?: boolean) => void;
  columns: ColumnOrColumnGroup<T>[];
  setColumns: Dispatch<SetStateAction<ColumnOrColumnGroup<T>[]>>;
};
