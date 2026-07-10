import { faker } from '@faker-js/faker';
import { appConfig, type ContextEntityType, type EntityRole, hierarchy, roles } from 'shared';
import {
  generateMockContextIdColumns,
  MOCK_REF_DATE,
  type MockContextIdColumns,
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
  contextType: ContextEntityType;
  contextId: string;
  userId: string;
  role: EntityRole;
  displayOrder: number;
  muted: boolean;
  archived: boolean;
} & MockContextIdColumns;

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
type ContextEntityIdOverrides = Partial<MockContextIdColumns>;

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

  return {
    id: mockUuid(),
    userId,
    tenantId: contextEntity.tenantId, // Use context entity's tenant for RLS isolation
    contextType,
    contextId: contextEntity.id, // Denormalized primary context entity ID
    ...contextEntityColumns,
    [appConfig.entityIdColumnKeys[contextType]]: contextEntity.id, // Set the correct context entity ID
    ...overrideIds,
    // Pick from the context's own role vocabulary (e.g. course → staff/student/guest)
    role: faker.helpers.arrayElement(hierarchy.getRoles(contextType)),
    displayOrder: getMembershipOrderOffset(contextEntity.id) * 10,
    createdAt: mockPastIsoDate(),
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
    id: mockUuid(),
    tenantId: mockTenantId(),
    contextType: 'organization' as const,
    contextId: mockUuid(),
    userId: mockUuid(),
    ...generateMockContextIdColumns(),
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
    const refDate = MOCK_REF_DATE;
    const createdAt = faker.date.past({ refDate }).toISOString();
    const userId = mockUuid();
    const contextEntityColumns = generateMockContextIdColumns();

    return {
      id: mockUuid(),
      contextType: 'organization' as const,
      contextId: mockUuid(),
      userId,
      ...contextEntityColumns,
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
 * Context entity ID columns are generated dynamically based on appConfig.contextEntityTypes.
 */
export const mockInactiveMembership = (key = 'inactive-membership:default'): InactiveMembershipModel =>
  withFakerSeed(key, () => {
    const refDate = MOCK_REF_DATE;
    const createdAt = faker.date.past({ refDate }).toISOString();
    const userId = mockUuid();
    const contextEntityColumns = generateMockContextIdColumns();
    const tokenId = mockUuid();

    return {
      id: mockUuid(),
      contextType: 'organization' as const,
      contextId: mockUuid(),
      email: faker.internet.email().toLowerCase(),
      userId,
      tokenId,
      role: faker.helpers.arrayElement(roles.all),
      rejectedAt: null,
      remindedAt: null,
      createdAt,
      createdBy: mockUuid(),
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
