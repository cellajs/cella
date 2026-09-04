import { faker } from '@faker-js/faker';
import { appConfig, type ChannelEntityType, type EntityIdColumns, type EntityRole, hierarchy } from 'shared';
import { mockPaginated, mockPastIsoDate, mockTenantId, mockUuid, withFakerSeed } from '#/mocks';
import type { InactiveMembershipModel } from '#/modules/memberships/inactive-memberships-db';
import type { InsertMembershipModel, MembershipModel } from '#/modules/memberships/memberships-db';
import type { UserModel } from '#/modules/user/user-db';
import { mockUserBase, mockUserMinimalBase } from '#/schemas/entity-base-mocks';

/** MembershipBase type defined here to avoid circular dependency with memberships-schema */
type MembershipBase = Omit<MembershipModel, 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy'>;

const membershipOrderMap: Map<string, number> = new Map();

export const getMembershipOrderOffset = (channelId: string): number => {
  if (!membershipOrderMap.has(channelId)) {
    membershipOrderMap.set(channelId, membershipOrderMap.size + 1);
  }
  return membershipOrderMap.get(channelId)!;
};

/** Minimal channel entity interface for membership creation; ancestor ID columns are read off the row when present */
type ChannelRef = { id: string; tenantId: string } & Partial<MembershipChannelIdColumns>;

/** Override IDs for channel entity columns (organizationId, workspaceId, etc.) */
type MembershipChannelIdColumns = EntityIdColumns<ChannelEntityType, string | null>;
type ChannelIdOverrides = Partial<MembershipChannelIdColumns>;

/**
 * Membership location columns for wire mocks: contexts start null, ancestors get invented UUIDs, and the target column
 * always equals the denormalized `channelId`. Never use for database rows: invented ancestor IDs violate FKs.
 */
const generateMockMembershipChannelIdColumns = (
  channelType: ChannelEntityType,
  channelId: string,
  overrides: ChannelIdOverrides = {},
): MembershipChannelIdColumns => {
  const columns = Object.fromEntries(
    appConfig.channelEntityTypes.map((type) => [appConfig.entityIdColumnKeys[type], null]),
  ) as MembershipChannelIdColumns;

  for (const ancestor of hierarchy.getOrderedAncestors(channelType)) {
    columns[appConfig.entityIdColumnKeys[ancestor]] = mockUuid();
  }
  Object.assign(columns, overrides);
  columns[appConfig.entityIdColumnKeys[channelType]] = channelId;
  return columns;
};

/**
 * Membership location columns for a real channel entity row: ancestors are read off the row (nullable ones stay null),
 * `overrides` win, and the target column equals the denormalized `channelId`. Safe for inserts: no ancestor ID is invented.
 */
const deriveMembershipChannelIdColumns = (
  channelType: ChannelEntityType,
  channel: ChannelRef,
  overrides: ChannelIdOverrides = {},
): MembershipChannelIdColumns => {
  const columns = Object.fromEntries(
    appConfig.channelEntityTypes.map((type) => [appConfig.entityIdColumnKeys[type], null]),
  ) as MembershipChannelIdColumns;

  for (const ancestor of hierarchy.getOrderedAncestors(channelType)) {
    const columnKey = appConfig.entityIdColumnKeys[ancestor];
    columns[columnKey] = channel[columnKey] ?? null;
  }
  Object.assign(columns, overrides);
  columns[appConfig.entityIdColumnKeys[channelType]] = channel.id;
  return columns;
};

export type MockMembershipBaseOptions = {
  channelType?: ChannelEntityType;
  channelId?: string;
  channelIds?: ChannelIdOverrides;
  userId?: string;
  tenantId?: string;
  role?: EntityRole;
};

/** Seedless membership-base fragment shared by stored and response mocks. */
const generateMembershipBase = (options: MockMembershipBaseOptions = {}): MembershipBase => {
  const channelType = options.channelType ?? 'organization';
  const channelId = options.channelId ?? mockUuid();
  return {
    id: mockUuid(),
    tenantId: options.tenantId ?? mockTenantId(),
    channelType,
    channelId,
    userId: options.userId ?? mockUuid(),
    ...generateMockMembershipChannelIdColumns(channelType, channelId, options.channelIds),
    role: options.role ?? faker.helpers.arrayElement(hierarchy.getRoles(channelType)),
    displayOrder: faker.number.int({ min: 1, max: 100 }),
    muted: false,
    archived: false,
  } as MembershipBase;
};

/**
 * Mock membership linking a user to a channel entity. Ancestor ID columns are derived from the channel row
 * (`overrideIds` win) and never invented, so the result is safe against FK constraints.
 */
export const mockChannelMembership = <T extends ChannelEntityType>(
  channelType: T,
  channel: ChannelRef,
  user: UserModel | { id: string },
  overrideIds?: ChannelIdOverrides,
): InsertMembershipModel => {
  const userId = user.id;

  return {
    id: mockUuid(),
    userId,
    tenantId: channel.tenantId, // Use channel entity's tenant for RLS isolation
    channelType,
    channelId: channel.id, // Denormalized primary channel entity ID
    ...deriveMembershipChannelIdColumns(channelType, channel, overrideIds),
    // Pick from the context's own role vocabulary (e.g. course → staff/student/guest)
    role: faker.helpers.arrayElement(hierarchy.getRoles(channelType)),
    displayOrder: getMembershipOrderOffset(channel.id) * 10,
    createdAt: mockPastIsoDate(),
    createdBy: userId,
  } as InsertMembershipModel;
};

/** Deterministic membership-base fragment. */
export const mockMembershipBase = (
  key = 'membership-base:default',
  options: MockMembershipBaseOptions = {},
): MembershipBase => withFakerSeed(key, () => generateMembershipBase(options));

/** Deterministic stored membership row. */
export const mockMembership = (key = 'membership:default', options: MockMembershipBaseOptions = {}): MembershipModel =>
  withFakerSeed(key, () => {
    const createdAt = mockPastIsoDate();
    const base = generateMembershipBase(options);

    return {
      ...base,
      createdAt,
      createdBy: base.userId,
      updatedAt: createdAt,
      updatedBy: null,
    };
  });

/** Membership response example; its wire shape matches the stored membership shape. */
export const mockMembershipResponse = mockMembership;

/** Deterministic stored inactive-membership row. */
export const mockInactiveMembership = (
  key = 'inactive-membership:default',
  options: MockMembershipBaseOptions = {},
): InactiveMembershipModel =>
  withFakerSeed(key, () => {
    const createdAt = mockPastIsoDate();
    const base = generateMembershipBase(options);

    return {
      id: base.id,
      channelType: base.channelType,
      channelId: base.channelId,
      email: faker.internet.email().toLowerCase(),
      userId: base.userId,
      tokenId: mockUuid(),
      role: base.role,
      rejectedAt: null,
      remindedAt: null,
      createdAt,
      createdBy: mockUuid(),
      ...generateMockMembershipChannelIdColumns(base.channelType, base.channelId, options.channelIds),
      tenantId: base.tenantId,
    } as InactiveMembershipModel;
  });

/** Inactive membership wire response with its creator hydrated. */
export const mockInactiveMembershipResponse = (
  key = 'inactive-membership:default',
  options: MockMembershipBaseOptions = {},
) => {
  const membership = mockInactiveMembership(key, options);
  return {
    ...membership,
    createdBy: mockUserMinimalBase(`${key}:created-by`, membership.createdBy),
  };
};

export const mockPaginatedInactiveMembershipsResponse = (count = 2) =>
  mockPaginated(mockInactiveMembershipResponse, count);

export const mockMemberResponse = (key = 'member:default') => {
  const user = mockUserBase(`${key}:user`);
  return {
    ...user,
    lastSeenAt: user.updatedAt,
    membership: mockMembershipBase(`${key}:membership`, { userId: user.id }),
  };
};

export const mockPaginatedMembersResponse = (count = 2) => mockPaginated(mockMemberResponse, count);

export const mockMembershipInviteResponse = (key = 'membership-invite:default') => ({
  data: [mockMembershipBase(`${key}:membership`)],
  rejectedIds: [] as string[],
  invitesSentCount: 1,
});
