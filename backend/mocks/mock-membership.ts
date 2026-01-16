import { faker } from '@faker-js/faker';
import { appConfig } from 'config';
import type { InactiveMembershipModel } from '#/db/schema/inactive-memberships';
import type { InsertMembershipModel, MembershipModel } from '#/db/schema/memberships';
import type { OrganizationModel } from '#/db/schema/organizations';
import type { UserModel } from '#/db/schema/users';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import { nanoid } from '#/utils/nanoid';
import { registerExample } from './example-registry';
import { generateMockContextEntityIdColumns, mockNanoid, pastIsoDate, withFakerSeed } from './utils';

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
    role: faker.helpers.arrayElement(appConfig.roles.entityRoles),
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
export const mockMembershipBase = (key = 'membership-base:default'): MembershipBaseModel =>
  withFakerSeed(key, () => ({
    id: mockNanoid(),
    contextType: 'organization' as const,
    userId: mockNanoid(),
    ...generateMockContextEntityIdColumns(),
    role: faker.helpers.arrayElement(appConfig.roles.entityRoles),
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
      role: faker.helpers.arrayElement(appConfig.roles.entityRoles),
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
      role: faker.helpers.arrayElement(appConfig.roles.entityRoles),
      rejectedAt: null,
      createdAt,
      createdBy: mockNanoid(),
      ...contextEntityColumns,
      uniqueKey: `${userId}-${contextEntityColumns.organizationId}`,
    };
  });

/** Alias for API response examples */
export const mockInactiveMembershipResponse = mockInactiveMembership;

// Self-register for OpenAPI examples
registerExample('Membership', mockMembershipResponse);
registerExample('InactiveMembership', mockInactiveMembershipResponse);
