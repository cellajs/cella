import { faker } from '@faker-js/faker';
import { appConfig, type ContextEntityType, type EntityRole, roles } from 'shared';
import type { InactiveMembershipModel } from '#/db/schema/inactive-memberships';
import type { InsertMembershipModel, MembershipModel } from '#/db/schema/memberships';
import type { UserModel } from '#/db/schema/users';
import { nanoid } from '#/utils/nanoid';
import {
  generateMockContextEntityIdColumns,
  type MockContextEntityIdColumns,
  mockNanoid,
  mockPaginated,
  mockTenantId,
  pastIsoDate,
  withFakerSeed,
} from './utils';

/** MembershipBase type defined here to avoid circular dependency with memberships-schema */
type MembershipBase = {
  id: string;
  tenantId: string;
  contextType: ContextEntityType;
  userId: string;
  role: EntityRole;
  displayOrder: number;
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

/** Minimal context entity interface for membership creation */
type ContextEntity = { id: string; tenantId: string };

/** Override IDs for context entity columns (organizationId, workspaceId, etc.) */
type ContextEntityIdOverrides = Partial<MockContextEntityIdColumns>;

/**
 * Generates a mock membership linking a user to a context entity.
 * Works with any context entity type (organization, project, etc.).
 * Initializes all context entity ID columns to null, then sets the specific context entity ID.
 * Additional ancestor IDs can be provided via overrideIds.
 * Ensures consistent ordering via the `getMembershipOrderOffset` function.
 */
export const mockContextMembership = <T extends ContextEntityType>(
  contextType: T,
  contextEntity: ContextEntity,
  user: UserModel | { id: string },
  overrideIds?: ContextEntityIdOverrides,
): InsertMembershipModel => {
  const userId = user.id;

  // Initialize all context entity ID columns to null (nullable FK columns)
  const contextEntityColumns = Object.fromEntries(
    appConfig.contextEntityTypes.map((type) => [appConfig.entityIdColumnKeys[type], null]),
  );

  // Determine the correct ID column name for this context type (e.g., 'organizationId')
  const contextIdColumnKey = appConfig.entityIdColumnKeys[contextType];

  return {
    id: nanoid(),
    userId,
    tenantId: contextEntity.tenantId, // Use context entity's tenant for RLS isolation
    contextType,
    ...contextEntityColumns,
    [contextIdColumnKey]: contextEntity.id, // Set the correct context entity ID
    ...overrideIds,
    role: faker.helpers.arrayElement(roles.all),
    displayOrder: getMembershipOrderOffset(contextEntity.id) * 10,
    createdAt: pastIsoDate(),
    createdBy: userId,
  } as InsertMembershipModel;
};

/**
 * Generates a mock membership base for API responses.
 * Uses deterministic seeding - same key produces same data.
 * Context entity ID columns are generated dynamically based on appConfig.contextEntityTypes.
 */
export const mockMembershipBase = (key = 'membership-base:default'): MembershipBase =>
  withFakerSeed(key, () => ({
    id: mockNanoid(),
    tenantId: mockTenantId(),
    contextType: 'organization' as const,
    userId: mockNanoid(),
    ...generateMockContextEntityIdColumns(),
    role: faker.helpers.arrayElement(roles.all),
    displayOrder: faker.number.int({ min: 1, max: 100 }),
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
      role: faker.helpers.arrayElement(roles.all),
      displayOrder: faker.number.int({ min: 1, max: 100 }),
      muted: false,
      archived: false,
      createdAt,
      createdBy: userId,
      modifiedAt: createdAt,
      modifiedBy: null,
      tenantId: 'test01', // Default test tenant
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
      role: faker.helpers.arrayElement(roles.all),
      rejectedAt: null,
      createdAt,
      createdBy: mockNanoid(),
      ...contextEntityColumns,
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
    data: [mockMembershipBase()],
    rejectedItemIds: [] as string[],
    invitesSentCount: 1,
  }));
