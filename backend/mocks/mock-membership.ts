import { faker } from '@faker-js/faker';
import { appConfig, type ContextEntityType, type EntityRole } from 'config';
import type { InactiveMembershipModel } from '#/db/schema/inactive-memberships';
import type { InsertMembershipModel, MembershipModel } from '#/db/schema/memberships';
import type { OrganizationModel } from '#/db/schema/organizations';
import type { UserModel } from '#/db/schema/users';
import { nanoid } from '#/utils/nanoid';
import {
  generateMockContextEntityIdColumns,
  type MockContextEntityIdColumns,
  mockNanoid,
  mockPaginated,
  pastIsoDate,
  withFakerSeed,
} from './utils';

/** MembershipBase type defined here to avoid circular dependency with memberships-schema */
type MembershipBase = {
  id: string;
  contextType: ContextEntityType;
  userId: string;
  role: EntityRole;
  order: number;
  muted: boolean;
  archived: boolean;
} & MockContextEntityIdColumns;

// Tracks the current order offset for memberships per context (e.g., organization)
const membershipOrderMap: Map<string, number> = new Map();

/**
 * Returns a unique order offset for a given context (e.g., organization ID).
 * Ensures incremental order values for memberships within the same context.
 */
export const getMembershipOrderOffset = (contextId: string): number => {
  if (!membershipOrderMap.has(contextId)) {
    membershipOrderMap.set(contextId, membershipOrderMap.size + 1);
  }
  return membershipOrderMap.get(contextId)!;
};

/**
 * Generates a mock membership linking a user to an organization.
 * Ensures consistent ordering via the `getMembershipOrderOffset` function.
 */
export const mockOrganizationMembership = (organization: OrganizationModel, user: UserModel): InsertMembershipModel => {
  return {
    id: nanoid(),
    userId: user.id,
    organizationId: organization.id,
    contextType: 'organization',
    role: faker.helpers.arrayElement(appConfig.entityRoles),
    order: getMembershipOrderOffset(organization.id) * 10,
    createdAt: pastIsoDate(),
    createdBy: user.id,
    uniqueKey: `${user.id}-${organization.id}`,
  };
};

/**
 * Generates a mock membership base for API responses.
 * Uses deterministic seeding - same key produces same data.
 * Context entity ID columns are generated dynamically based on appConfig.contextEntityTypes.
 */
export const mockMembershipBase = (key = 'membership-base:default'): MembershipBase =>
  withFakerSeed(key, () => ({
    id: mockNanoid(),
    contextType: 'organization' as const,
    userId: mockNanoid(),
    ...generateMockContextEntityIdColumns(),
    role: faker.helpers.arrayElement(appConfig.entityRoles),
    order: faker.number.int({ min: 1, max: 100 }),
    muted: false,
    archived: false,
  }));

/**
 * Generates a mock full membership for API responses.
 * Uses deterministic seeding - same key produces same data.
 * Context entity ID columns are generated dynamically based on appConfig.contextEntityTypes.
 */
export const mockMembership = (key = 'membership:default'): MembershipModel =>
  withFakerSeed(key, () => {
    const refDate = new Date('2025-01-01T00:00:00.000Z');
    const createdAt = faker.date.past({ refDate }).toISOString();
    const userId = mockNanoid();
    const contextEntityColumns = generateMockContextEntityIdColumns();

    return {
      id: mockNanoid(),
      contextType: 'organization' as const,
      userId,
      ...contextEntityColumns,
      role: faker.helpers.arrayElement(appConfig.entityRoles),
      order: faker.number.int({ min: 1, max: 100 }),
      muted: false,
      archived: false,
      createdAt,
      createdBy: userId,
      modifiedAt: createdAt,
      modifiedBy: null,
      uniqueKey: `${userId}-${contextEntityColumns.organizationId}`,
    };
  });

/** Alias for API response examples */
export const mockMembershipResponse = mockMembership;

/**
 * Generates a mock inactive membership for API responses.
 * Uses deterministic seeding - same key produces same data.
 * Context entity ID columns are generated dynamically based on appConfig.contextEntityTypes.
 */
export const mockInactiveMembership = (key = 'inactive-membership:default'): InactiveMembershipModel =>
  withFakerSeed(key, () => {
    const refDate = new Date('2025-01-01T00:00:00.000Z');
    const createdAt = faker.date.past({ refDate }).toISOString();
    const userId = mockNanoid();
    const contextEntityColumns = generateMockContextEntityIdColumns();
    const tokenId = mockNanoid();

    return {
      id: mockNanoid(),
      contextType: 'organization' as const,
      email: faker.internet.email().toLowerCase(),
      userId,
      tokenId,
      role: faker.helpers.arrayElement(appConfig.entityRoles),
      rejectedAt: null,
      createdAt,
      createdBy: mockNanoid(),
      ...contextEntityColumns,
      uniqueKey: `${userId}-${contextEntityColumns.organizationId}`,
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
    const refDate = new Date('2025-01-01T00:00:00.000Z');
    const createdAt = faker.date.past({ refDate }).toISOString();
    const userId = mockNanoid();

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
      modifiedAt: createdAt,
      modifiedBy: null,
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
    success: true,
    rejectedItemIds: [] as string[],
    invitesSentCount: 2,
  }));
