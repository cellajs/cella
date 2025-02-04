import type { ContextEntity, EnabledOauthProvider } from 'config';
import type { InferResponseType } from 'hono/client';
import type { Dispatch, SetStateAction } from 'react';
import type { SortColumn } from 'react-data-grid';
import type { z } from 'zod';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/columns-view';
import type { meClient } from '~/modules/users/api';
import type { attachmentSchema } from '#/modules/attachments/schema';
import type { checkTokenSchema } from '#/modules/auth/schema';
import type { membersSchema } from '#/modules/general/schema';
import type { membershipInfoSchema, membershipSchema } from '#/modules/memberships/schema';
import type { invitesSchema, organizationSchema, organizationWithMembershipSchema } from '#/modules/organizations/schema';
import type { requestSchema } from '#/modules/requests/schema';
import type { limitedUserSchema, userSchema } from '#/modules/users/schema';

export type User = z.infer<typeof userSchema>;
export type LimitedUser = z.infer<typeof limitedUserSchema>;

export type Session = Extract<InferResponseType<(typeof meClient.index)['$get']>, { data: unknown }>['data']['sessions'][number];
export type MeUser = User & { sessions: Session[]; passkey: boolean; oauth: EnabledOauthProvider[] };
export type UserMenu = Extract<InferResponseType<(typeof meClient.menu)['$get']>, { data: unknown }>['data'];
export type UserMenuItem = UserMenu[keyof UserMenu][number];

export type Organization = z.infer<typeof organizationSchema>;
export type OrganizationInvites = z.infer<typeof invitesSchema>[number];
export type OrganizationWithMembership = z.infer<typeof organizationWithMembershipSchema>;

export type Attachment = z.infer<typeof attachmentSchema>;

export type TokenData = z.infer<typeof checkTokenSchema>;

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
};

// TODO: move below to data-table?
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
