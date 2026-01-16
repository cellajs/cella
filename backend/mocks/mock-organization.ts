import { faker } from '@faker-js/faker';
import { appConfig, type Language } from 'config';
import { UniqueEnforcer } from 'enforce-unique';
import slugify from 'slugify';
import type { InsertOrganizationModel, OrganizationModel } from '#/db/schema/organizations';
import type { AuthStrategy } from '#/db/schema/sessions';
import { defaultRestrictions } from '#/db/utils/organization-restrictions';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import { nanoid } from '#/utils/nanoid';
import { mockNanoid, pastIsoDate, withFakerSeed } from './utils';

// Enforces unique organization names
const organizationName = new UniqueEnforcer();

/**
 * Reset unique enforcers - call this when clearing the database in tests.
 */
export const resetOrganizationMockEnforcers = () => {
  organizationName.reset();
};

/**
 * Generates a mock organization record with all fields populated.
 * Used for DB seeding, tests, and as base for API response examples.
 * Enforces unique organization names.
 */
export const mockOrganization = (): InsertOrganizationModel => {
  const name = organizationName.enforce(() => faker.company.name());
  const slug = slugify(name, { lower: true, strict: true });
  const createdAt = pastIsoDate();

  return {
    id: nanoid(),
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
 * Generates a mock organization API response with deterministic seeding.
 * Adds API-only fields (membership, counts) to the base mock.
 */
export const mockOrganizationResponse = (
  key = 'organization:default',
): OrganizationModel & {
  membership: MembershipBaseModel;
  counts: {
    membership: { admin: number; member: number; pending: number; total: number };
    entities: { attachment: number; page: number };
  };
} =>
  withFakerSeed(key, () => {
    const refDate = new Date('2025-01-01T00:00:00.000Z');
    const createdAt = faker.date.past({ refDate }).toISOString();
    const name = faker.company.name();
    const slug = slugify(name, { lower: true, strict: true });
    const orgId = mockNanoid();
    const userId = mockNanoid();

    return {
      id: orgId,
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
      restrictions: defaultRestrictions(),
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
      membership: {
        id: mockNanoid(),
        contextType: 'organization' as const,
        userId,
        organizationId: orgId,
        role: 'admin' as const,
        order: 1,
        muted: false,
        archived: false,
      },
      counts: {
        membership: {
          admin: 1,
          member: faker.number.int({ min: 0, max: 20 }),
          pending: 0,
          total: faker.number.int({ min: 1, max: 25 }),
        },
        entities: { attachment: faker.number.int({ min: 0, max: 50 }), page: faker.number.int({ min: 0, max: 20 }) },
      },
    };
  });
