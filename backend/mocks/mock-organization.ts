import { faker } from '@faker-js/faker';
import { appConfig, type Language } from 'config';
import { UniqueEnforcer } from 'enforce-unique';
import slugify from 'slugify';
import type { InsertOrganizationModel, OrganizationModel } from '#/db/schema/organizations';
import type { AuthStrategy } from '#/db/schema/sessions';
import { defaultRestrictions } from '#/db/utils/organization-restrictions';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import { nanoid } from '#/utils/nanoid';
import { mockMembershipBase } from './mock-membership';
import {
  type MockEntityCounts,
  type MockMembershipCounts,
  generateMockFullCounts,
  mockNanoid,
  pastIsoDate,
  withFakerSeed,
} from './utils';

// Enforces unique organization names
const organizationName = new UniqueEnforcer();

/**
 * Reset unique enforcers - call this when clearing the database in tests.
 */
export const resetOrganizationMockEnforcers = () => {
  organizationName.reset();
};

/**
 * Generates base organization fields shared between insert and response mocks.
 * @param id - Organization ID
 * @param name - Organization name
 * @param createdAt - Creation timestamp
 */
const generateOrganizationBase = (id: string, name: string, createdAt: string) => {
  const slug = slugify(name, { lower: true, strict: true });

  return {
    id,
    entityType: 'organization' as const,
    name,
    slug,
    description: faker.company.catchPhrase(),
    shortName: name.split(' ')[0],
    country: faker.location.country(),
    timezone: faker.location.timeZone(),
    defaultLanguage: appConfig.defaultLanguage,
    languages: [appConfig.defaultLanguage] as Language[],
    notificationEmail: `notifications@${slug}.example`,
    emailDomains: [] as string[],
    color: faker.color.rgb(),
    thumbnailUrl: null,
    logoUrl: faker.image.url(),
    bannerUrl: null,
    websiteUrl: `https://${slug}.example`,
    welcomeText: `Welcome to ${name}!`,
    authStrategies: ['password'] as AuthStrategy[],
    chatSupport: faker.datatype.boolean(),
    createdAt,
    createdBy: null,
    modifiedAt: createdAt,
    modifiedBy: null,
  };
};

/**
 * Generates a mock organization record with all fields populated.
 * Used for DB seeding, tests, and as base for API response examples.
 * Enforces unique organization names.
 */
export const mockOrganization = (): InsertOrganizationModel => {
  const name = organizationName.enforce(() => faker.company.name());
  return generateOrganizationBase(nanoid(), name, pastIsoDate());
};

/**
 * Generates a mock organization API response with deterministic seeding.
 * Adds API-only fields (membership, counts) to the base mock.
 */
export const mockOrganizationResponse = (
  key = 'organization:default',
): OrganizationModel & {
  membership: MembershipBaseModel;
  counts: {
    membership: MockMembershipCounts;
    entities: MockEntityCounts;
  };
} =>
  withFakerSeed(key, () => {
    const refDate = new Date('2025-01-01T00:00:00.000Z');
    const createdAt = faker.date.past({ refDate }).toISOString();
    const orgId = mockNanoid();

    // Generate base organization fields
    const base = generateOrganizationBase(orgId, faker.company.name(), createdAt);

    // Generate membership base with the organization ID
    const membership = mockMembershipBase(`${key}:membership`);
    membership.organizationId = orgId;

    return {
      ...base,
      restrictions: defaultRestrictions(),
      membership,
      counts: generateMockFullCounts(`${key}:counts`),
    };
  });
