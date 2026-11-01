import { faker } from '@faker-js/faker';
import { appConfig, type ChannelEntityType, type EntityIdColumns, type EntityRole, hierarchy } from 'shared';
import { mockPaginated, mockPastIsoDate, mockTenantId, mockUuid, withFakerSeed } from '#/mocks';
import type { InactiveMembershipModel } from '#/modules/memberships/inactive-memberships-db';
import type { InsertMembershipModel, MembershipModel } from '#/modules/memberships/memberships-db';
import { mockActorRef, mockUserBase } from '#/schemas/entity-base-mocks';

/** MembershipBase type defined here to avoid circular dependency with memberships-schema */
type MembershipBase = Omit<MembershipModel, 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy'>;

const membershipOrderMap: Map<string, number> = new Map();

/** A seed helper: the channel's ordinal (from 1) among the channels asked about in this process, the same on every call. */
export const getMembershipOrderOffset = (channelId: string): number => {
  const offset = membershipOrderMap.get(channelId) ?? membershipOrderMap.size + 1;
  membershipOrderMap.set(channelId, offset);
  return offset;
};

/** Minimal channel entity interface for membership creation; ancestor ID columns are read off the row when present */
type ChannelRef = { id: string; tenantId: string } & Partial<MembershipChannelIdColumns>;

/** One id, or null, per channel type's id column. */
type MembershipChannelIdColumns = EntityIdColumns<ChannelEntityType, string | null>;
type ChannelIdOverrides = Partial<MembershipChannelIdColumns>;

/**
 * Membership location columns: other channels' columns start null, each ancestor's takes `ancestorId(columnKey)`,
 * `overrides` win, and the target column always equals the denormalized `channelId`. An invented ancestor id suits a
 * wire mock only: in a database row it violates FKs.
 */
const membershipChannelIdColumns = (
  channelType: ChannelEntityType,
  channelId: string,
  ancestorId: (columnKey: keyof MembershipChannelIdColumns) => string | null,
  overrides: ChannelIdOverrides = {},
): MembershipChannelIdColumns => {
  const columns = Object.fromEntries(
    appConfig.channelEntityTypes.map((type) => [appConfig.entityIdColumnKeys[type], null]),
  ) as MembershipChannelIdColumns;

  for (const ancestor of hierarchy.getOrderedAncestors(channelType)) {
    const columnKey = appConfig.entityIdColumnKeys[ancestor];
    columns[columnKey] = ancestorId(columnKey);
  }
  Object.assign(columns, overrides);
  columns[appConfig.entityIdColumnKeys[channelType]] = channelId;
  return columns;
};

type MockMembershipBaseOptions = {
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
    ...membershipChannelIdColumns(channelType, channelId, () => mockUuid(), options.channelIds),
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
export const mockChannelMembership = (
  channelType: ChannelEntityType,
  channel: ChannelRef,
  user: { id: string },
  overrideIds?: ChannelIdOverrides,
): InsertMembershipModel => {
  const userId = user.id;

  return {
    id: mockUuid(),
    userId,
    tenantId: channel.tenantId,
    channelType,
    channelId: channel.id,
    ...membershipChannelIdColumns(channelType, channel.id, (columnKey) => channel[columnKey] ?? null, overrideIds),
    role: faker.helpers.arrayElement(hierarchy.getRoles(channelType)),
    displayOrder: getMembershipOrderOffset(channel.id) * 10,
    createdAt: mockPastIsoDate(),
    createdBy: userId,
  } as InsertMembershipModel;
};

/** Deterministic membership-base fragment. */
export const mockMembershipBase = (key = 'membership-base:default', options: MockMembershipBaseOptions = {}): MembershipBase =>
  withFakerSeed(key, () => generateMembershipBase(options));

/** Deterministic stored membership row. */
const mockMembership = (key = 'membership:default', options: MockMembershipBaseOptions = {}): MembershipModel =>
  withFakerSeed(key, () => {
    const createdAt = mockPastIsoDate();
    const base = generateMembershipBase(options);

    return { ...base, createdAt, createdBy: base.userId, updatedAt: createdAt, updatedBy: null };
  });

/** Membership response example: the stored row with its writers resolved to references. */
export const mockMembershipResponse = (key = 'membership:default', options: MockMembershipBaseOptions = {}) => {
  const membership = mockMembership(key, options);
  return { ...membership, createdBy: mockActorRef(`${key}:created-by`, membership.createdBy ?? undefined), updatedBy: null };
};

/** Deterministic stored inactive-membership row. */
const mockInactiveMembership = (key = 'inactive-membership:default', options: MockMembershipBaseOptions = {}): InactiveMembershipModel =>
  withFakerSeed(key, () => {
    const createdAt = mockPastIsoDate();
    const base = generateMembershipBase(options);

    return {
      id: base.id,
      channelType: base.channelType,
      channelId: base.channelId,
      email: faker.internet.email().toLowerCase(),
      userId: base.userId,
      role: base.role,
      rejectedAt: null,
      remindedAt: null,
      createdAt,
      createdBy: mockUuid(),
      ...membershipChannelIdColumns(base.channelType, base.channelId, () => mockUuid(), options.channelIds),
      tenantId: base.tenantId,
    } as InactiveMembershipModel;
  });

/** Inactive membership wire response with its creator hydrated. */
export const mockInactiveMembershipResponse = (key = 'inactive-membership:default', options: MockMembershipBaseOptions = {}) => {
  const membership = mockInactiveMembership(key, options);
  return { ...membership, createdBy: mockActorRef(`${key}:created-by`, membership.createdBy) };
};

/** Pending-invitation list row: the invited address, role and inviter, with no account fields. */
const mockPendingMembershipResponse = (key = 'pending-membership:default') => {
  const { id, email, role, createdAt, createdBy } = mockInactiveMembershipResponse(key);
  return { id, email, role, createdAt, remindedAt: createdAt, linkExpiresAt: createdAt, createdBy };
};

export const mockPaginatedPendingMembershipsResponse = (count = 2) => mockPaginated(mockPendingMembershipResponse, count);

const mockMemberResponse = (key = 'member:default') => {
  const user = mockUserBase(`${key}:user`);
  return { ...user, lastSeenAt: user.updatedAt, membership: mockMembershipBase(`${key}:membership`, { userId: user.id }) };
};

export const mockPaginatedMembersResponse = (count = 2) => mockPaginated(mockMemberResponse, count);

/** An address the channel invited before, which the invite reminds. */
export const mockInviteOutcome = () => ({ email: 'p.okafor@example.net', outcome: 'remind' as const, invitedAt: '2026-10-20T09:12:00.000Z' });

const mockInviteOutcomes = () => [
  { email: 'sara.devries@example.com', outcome: 'invite' as const },
  mockInviteOutcome(),
  { email: 'lena@example.com', outcome: 'member' as const, role: 'member' as const },
];

export const mockMembershipCheckResponse = () => ({ outcomes: mockInviteOutcomes() });

export const mockMembershipInviteResponse = () => ({ data: [], outcomes: mockInviteOutcomes(), held: false });
