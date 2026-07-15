import { faker } from '@faker-js/faker';
import { appConfig, type ChannelEntityType, type EntityRole, hierarchy, roles } from 'shared';
import {
  generateMockChannelIdColumns,
  MOCK_REF_DATE,
  type MockChannelIdColumns,
  mockPaginated,
  mockPastIsoDate,
  mockTenantId,
  mockUuid,
  withFakerSeed,
} from '#/mocks';
import type { InactiveMembershipModel } from '#/modules/memberships/inactive-memberships-db';
import type { InsertMembershipModel, MembershipModel } from '#/modules/memberships/memberships-db';
import type { UserModel } from '#/modules/user/user-db';

/** MembershipBase type defined here to avoid circular dependency with memberships-schema */
type MembershipBase = {
  id: string;
  tenantId: string;
  channelType: ChannelEntityType;
  channelId: string;
  userId: string;
  role: EntityRole;
  displayOrder: number;
  muted: boolean;
  archived: boolean;
} & MockChannelIdColumns;

// Tracks the current order offset for memberships per context (e.g., organization)
const membershipOrderMap: Map<string, number> = new Map();

/**
 * Returns a unique order offset for a given context (e.g., organization ID).
 * Ensures incremental order values for memberships within the same context.
 */
export const getMembershipOrderOffset = (channelId: string): number => {
  if (!membershipOrderMap.has(channelId)) {
    membershipOrderMap.set(channelId, membershipOrderMap.size + 1);
  }
  return membershipOrderMap.get(channelId)!;
};

/** Minimal channel entity interface for membership creation */
type ChannelEntity = { id: string; tenantId: string };

/** Override IDs for channel entity columns (organizationId, workspaceId, etc.) */
type ChannelEntityIdOverrides = Partial<MockChannelIdColumns>;

/**
 * Mock membership linking a user to a channel entity (any type). Nulls all channel-entity ID columns,
 * then sets the target's (plus any ancestor IDs from `overrideIds`); ordering via `getMembershipOrderOffset`.
 */
export const mockChannelMembership = <T extends ChannelEntityType>(
  channelType: T,
  channelEntity: ChannelEntity,
  user: UserModel | { id: string },
  overrideIds?: ChannelEntityIdOverrides,
): InsertMembershipModel => {
  const userId = user.id;

  // Initialize all channel entity ID columns to null (nullable FK columns)
  const channelEntityColumns = Object.fromEntries(
    appConfig.channelEntityTypes.map((type) => [appConfig.entityIdColumnKeys[type], null]),
  );

  return {
    id: mockUuid(),
    userId,
    tenantId: channelEntity.tenantId, // Use channel entity's tenant for RLS isolation
    channelType,
    channelId: channelEntity.id, // Denormalized primary channel entity ID
    ...channelEntityColumns,
    [appConfig.entityIdColumnKeys[channelType]]: channelEntity.id, // Set the correct channel entity ID
    ...overrideIds,
    // Pick from the context's own role vocabulary (e.g. course → staff/student/guest)
    role: faker.helpers.arrayElement(hierarchy.getRoles(channelType)),
    displayOrder: getMembershipOrderOffset(channelEntity.id) * 10,
    createdAt: mockPastIsoDate(),
    createdBy: userId,
  } as InsertMembershipModel;
};

/**
 * Generates a mock membership base for API responses.
 * Uses deterministic seeding - same key produces same data.
 * Channel entity ID columns are generated dynamically based on appConfig.channelEntityTypes.
 */
export const mockMembershipBase = (key = 'membership-base:default'): MembershipBase =>
  withFakerSeed(key, () => ({
    id: mockUuid(),
    tenantId: mockTenantId(),
    channelType: 'organization' as const,
    channelId: mockUuid(),
    userId: mockUuid(),
    ...generateMockChannelIdColumns(),
    role: faker.helpers.arrayElement(roles.all),
    displayOrder: faker.number.int({ min: 1, max: 100 }),
    muted: false,
    archived: false,
  }));

/**
 * Generates a mock full membership for API responses.
 * Uses deterministic seeding - same key produces same data.
 * Channel entity ID columns are generated dynamically based on appConfig.channelEntityTypes.
 */
export const mockMembership = (key = 'membership:default'): MembershipModel =>
  withFakerSeed(key, () => {
    const refDate = MOCK_REF_DATE;
    const createdAt = faker.date.past({ refDate }).toISOString();
    const userId = mockUuid();
    const channelEntityColumns = generateMockChannelIdColumns();

    return {
      id: mockUuid(),
      channelType: 'organization' as const,
      channelId: mockUuid(),
      userId,
      ...channelEntityColumns,
      role: faker.helpers.arrayElement(roles.all),
      displayOrder: faker.number.int({ min: 1, max: 100 }),
      muted: false,
      archived: false,
      createdAt,
      createdBy: userId,
      updatedAt: createdAt,
      updatedBy: null,
      tenantId: 'test01', // Default test tenant
    };
  });

/** Alias for API response examples */
export const mockMembershipResponse = mockMembership;

/**
 * Generates a mock inactive membership for API responses.
 * Uses deterministic seeding - same key produces same data.
 * Channel entity ID columns are generated dynamically based on appConfig.channelEntityTypes.
 */
export const mockInactiveMembership = (key = 'inactive-membership:default'): InactiveMembershipModel =>
  withFakerSeed(key, () => {
    const refDate = MOCK_REF_DATE;
    const createdAt = faker.date.past({ refDate }).toISOString();
    const userId = mockUuid();
    const channelEntityColumns = generateMockChannelIdColumns();
    const tokenId = mockUuid();

    return {
      id: mockUuid(),
      channelType: 'organization' as const,
      channelId: mockUuid(),
      email: faker.internet.email().toLowerCase(),
      userId,
      tokenId,
      role: faker.helpers.arrayElement(roles.all),
      rejectedAt: null,
      remindedAt: null,
      createdAt,
      createdBy: mockUuid(),
      ...channelEntityColumns,
      tenantId: 'test01', // Default test tenant
    };
  });

/** Alias for API response examples */
export const mockInactiveMembershipResponse = mockInactiveMembership;

/**
 * Generates a paginated mock inactive membership list response for getPendingMemberships endpoint.
 */
export const mockPaginatedInactiveMembershipsResponse = (count = 2) =>
  mockPaginated(mockInactiveMembershipResponse, count);

/**
 * Generates a mock member response (user with membership).
 * Used for getMembers endpoint example.
 */
export const mockMemberResponse = (key = 'member:default') =>
  withFakerSeed(key, () => {
    const refDate = MOCK_REF_DATE;
    const createdAt = faker.date.past({ refDate }).toISOString();
    const userId = mockUuid();

    return {
      id: userId,
      entityType: 'user' as const,
      name: faker.person.fullName(),
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
      email: faker.internet.email().toLowerCase(),
      slug: faker.internet.username().toLowerCase(),
      description: null,
      thumbnailUrl: null,
      bannerUrl: null,
      language: 'en' as const,
      mfaRequired: false,
      createdAt,
      updatedAt: createdAt,
      updatedBy: null,
      lastStartedAt: createdAt,
      lastSignInAt: createdAt,
      lastSeenAt: createdAt,
      membership: mockMembershipBase(`${key}:membership`),
    };
  });

/**
 * Generates a paginated mock member list response for getMembers endpoint.
 */
export const mockPaginatedMembersResponse = (count = 2) => mockPaginated(mockMemberResponse, count);

/**
 * Generates a mock membership invite response.
 * Used for membershipInvite endpoint example.
 */
export const mockMembershipInviteResponse = (key = 'membership-invite:default') =>
  withFakerSeed(key, () => ({
    data: [mockMembershipBase()],
    rejectedIds: [] as string[],
    invitesSentCount: 1,
  }));
