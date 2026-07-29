import { faker } from '@faker-js/faker';
import { mockNanoid, mockTimestamps, mockUuid, withFakerSeed } from '#/mocks';

/**
 * Core fields shared by all entities (id + timestamps).
 * Must be called within withFakerSeed() for deterministic output.
 */
const mockEntityCore = () => ({
  id: mockUuid(),
  ...mockTimestamps(),
});

/**
 * Generates a mock ChannelBase response.
 * Channel entities have memberships (e.g., organization).
 */
export const mockChannelBase = (key = 'context-entity:default') =>
  withFakerSeed(key, () => {
    const name = faker.company.name();
    return {
      ...mockEntityCore(),
      tenantId: mockNanoid(),
      name,
      entityType: 'organization' as const,
      slug: faker.helpers.slugify(name).toLowerCase(),
      thumbnailUrl: null,
      bannerUrl: null,
    };
  });

/**
 * Generates a mock ProductBase response.
 * Product entities are content-related with createdBy/updatedBy.
 */
export const mockProductBase = (key = 'product-entity:default') =>
  withFakerSeed(key, () => ({
    ...mockEntityCore(),
    name: faker.lorem.sentence({ min: 2, max: 5 }),
    description: faker.lorem.paragraph(),
    keywords: faker.lorem.words(3),
    createdBy: mockUserMinimalBase(`${key}:createdBy`),
    updatedBy: mockUserMinimalBase(`${key}:updatedBy`),
    entityType: 'attachment' as const,
  }));

/**
 * Generates a mock UserMinimalBase response.
 * Minimal user data for references (e.g. createdBy, updatedBy).
 */
export const mockUserMinimalBase = (key = 'user-minimal:default', id?: string) =>
  withFakerSeed(key, () => {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    return {
      id: id ?? mockUuid(),
      name: `${firstName} ${lastName}`,
      slug: faker.internet.username({ firstName, lastName }).toLowerCase(),
      thumbnailUrl: null,
      entityType: 'user' as const,
    };
  });

/** Hydrates stored audit-user IDs to the minimal wire representation. */
export const mockAuditUsers = (row: { createdBy: string | null; updatedBy: string | null }, key: string) => {
  const createdBy = row.createdBy ? mockUserMinimalBase(`${key}:created-by`, row.createdBy) : null;
  const updatedBy =
    row.updatedBy === row.createdBy
      ? createdBy
      : row.updatedBy
        ? mockUserMinimalBase(`${key}:updated-by`, row.updatedBy)
        : null;
  return { createdBy, updatedBy };
};

/**
 * Generates a mock UserBase response.
 * Users are a special entity with email and slug.
 */
export const mockUserBase = (key = 'user-base:default') =>
  withFakerSeed(key, () => {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const name = `${firstName} ${lastName}`;

    return {
      ...mockEntityCore(),
      name,
      description: null,
      entityType: 'user' as const,
      slug: faker.internet.username({ firstName, lastName }).toLowerCase(),
      thumbnailUrl: null,
      bannerUrl: null,
      email: faker.internet.email({ firstName, lastName }).toLowerCase(),
    };
  });
