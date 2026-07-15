import { faker } from '@faker-js/faker';
import { UniqueEnforcer } from 'enforce-unique';
import { appConfig, type Language } from 'shared';
import slugify from 'slugify';
import {
  generateMockFullCounts,
  MOCK_REF_DATE,
  type MockActivityStamps,
  type MockEntityCounts,
  type MockMembershipCounts,
  mockBatchResponse,
  mockPaginated,
  mockPastIsoDate,
  mockTenantId,
  mockUuid,
  withFakerSeed,
} from '#/mocks';
import type { AuthStrategy } from '#/modules/auth/sessions-db';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import { mockMembershipBase } from '#/modules/memberships/memberships-mocks';
import type { InsertOrganizationModel, OrganizationModel } from '#/modules/organization/organization-db';

// Enforces unique organization names
const organizationName = new UniqueEnforcer();

/**
 * Reset unique enforcers - call this when clearing the database in tests.
 */
export const resetOrganizationMockEnforcers = () => {
  organizationName.reset();
};

/** Base organization fields shared between insert and response mocks. */
const generateOrganizationBase = (id: string, tenantId: string, name: string, createdAt: string) => {
  const slug = slugify(name, { lower: true, strict: true });

  return {
    id,
    tenantId,
    entityType: 'organization' as const,
    name,
    slug,
    shortName: name.split(' ')[0],
    country: faker.location.country(),
    timezone: faker.location.timeZone(),
    defaultLanguage: appConfig.defaultLanguage,
    languages: [appConfig.defaultLanguage] as Language[],
    notificationEmail: `notifications@${slug}.example`,
    color: faker.color.rgb().toLowerCase(),
    thumbnailUrl: null,
    bannerUrl: null,
    logoUrl: null,
    websiteUrl: `https://${slug}.example`,
    welcomeText: `Welcome to ${name}!`,
    authStrategies: ['passkey'] as AuthStrategy[],
    chatSupport: faker.datatype.boolean(),
    publishedAt: createdAt,
    publicAt: null,
    createdAt,
    createdBy: null,
    updatedAt: createdAt,
    updatedBy: null,
  };
};

/**
 * Generates a mock organization row with all fields populated.
 * Used for DB seeding, tests, and as base for API response examples.
 * Enforces unique organization names.
 */
export const mockOrganization = (): InsertOrganizationModel => {
  const name = organizationName.enforce(() => faker.company.name());
  return generateOrganizationBase(mockUuid(), mockTenantId(), name, mockPastIsoDate());
};

/**
 * Generates a mock organization API response with deterministic seeding.
 * Adds API-only fields (included.membership, included.counts) to the base mock.
 */
export const mockOrganizationResponse = (
  key = 'organization:default',
): OrganizationModel & {
  included: {
    membership: MembershipBaseModel;
    counts: {
      membership: MockMembershipCounts;
      entities: MockEntityCounts;
      activity: MockActivityStamps;
    };
  };
} =>
  withFakerSeed(key, () => {
    const refDate = MOCK_REF_DATE;
    const createdAt = faker.date.past({ refDate }).toISOString();
    const organizationId = mockUuid();
    const tenantId = mockTenantId();

    // Generate base organization fields
    const base = generateOrganizationBase(organizationId, tenantId, faker.company.name(), createdAt);

    // Generate membership base with the organization ID
    const membership = mockMembershipBase(`${key}:membership`);
    membership.organizationId = organizationId;

    return {
      ...base,
      included: {
        membership,
        counts: generateMockFullCounts(`${key}:counts`),
      },
    };
  });
/**
 * Generates a paginated mock organization list response for getOrganizations endpoint.
 */
export const mockPaginatedOrganizationsResponse = (count = 2) => mockPaginated(mockOrganizationResponse, count);

/**
 * Generates a mock batch organizations response.
 * Used for createOrganizations endpoint examples.
 */
export const mockBatchOrganizationsResponse = (count = 2) => mockBatchResponse(mockOrganizationResponse, count);
