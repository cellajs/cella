/**
 * Mock generators for base entity schemas.
 * Used for OpenAPI examples on shared entity schemas.
 *
 * These mocks use withFakerSeed() for deterministic output and
 * compose shared generators for DRY code.
 */

import { faker } from '@faker-js/faker';
import { mockNanoid, mockTimestamps, withFakerSeed } from './utils';

/**
 * Core fields shared by all entities (id + timestamps).
 * Must be called within withFakerSeed() for deterministic output.
 */
const mockEntityCore = () => ({
  id: mockNanoid(),
  ...mockTimestamps(),
});

/**
 * Generates a mock ContextEntityBase response.
 * Context entities have memberships (e.g., organization).
 */
export const mockContextEntityBase = (key = 'context-entity:default') =>
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
 * Generates a mock ProductEntityBase response.
 * Product entities are content-related with createdBy/modifiedBy.
 */
export const mockProductEntityBase = (key = 'product-entity:default') =>
  withFakerSeed(key, () => ({
    ...mockEntityCore(),
    name: faker.lorem.sentence({ min: 2, max: 5 }),
    description: faker.lorem.paragraph(),
    createdBy: mockNanoid(),
    modifiedBy: mockNanoid(),
    entityType: 'page' as const,
    keywords: faker.lorem.words(3),
  }));

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

/**
 * Generates a mock Request response.
 * Requests are contact/waitlist submissions.
 */
export const mockRequestResponse = (key = 'request:default') =>
  withFakerSeed(key, () => ({
    id: mockNanoid(),
    email: faker.internet.email().toLowerCase(),
    type: faker.helpers.arrayElement(['contact', 'waitlist'] as const),
    message: faker.lorem.sentence(),
    createdAt: mockTimestamps().createdAt,
    wasInvited: faker.datatype.boolean(),
  }));

/**
 * Generates a mock StxRequest example.
 * Used for sync transaction requests.
 */
export const mockStxRequest = (key = 'stx-request:default') =>
  withFakerSeed(key, () => ({
    mutationId: mockNanoid(),
    sourceId: mockNanoid(),
    lastReadVersion: 0,
  }));

/**
 * Generates a mock StxResponse example.
 * Used for sync transaction responses.
 */
export const mockStxResponse = (key = 'stx-response:default') =>
  withFakerSeed(key, () => ({
    mutationId: mockNanoid(),
    version: faker.number.int({ min: 1, max: 10 }),
  }));

/**
 * Generates a mock StxBase example.
 * Used for sync transaction base metadata on entities.
 */
export const mockStxBase = (key = 'stx-base:default') =>
  withFakerSeed(key, () => ({
    mutationId: mockNanoid(),
    sourceId: mockNanoid(),
    version: faker.number.int({ min: 1, max: 5 }),
    fieldVersions: { name: 1 },
  }));

/**
 * Generates a mock StreamNotification example for product entity events.
 * Used for both app and public stream notifications.
 *
 * For product entities (page, attachment):
 * - entityType is set, resourceType is null
 * - Includes stx, seq, cacheToken for sync engine
 * - contextType is null (not a context entity event)
 */
export const mockStreamNotification = (key = 'stream-notification:default') =>
  withFakerSeed(key, () => ({
    action: faker.helpers.arrayElement(['create', 'update', 'delete'] as const),
    entityType: faker.helpers.arrayElement(['page', 'attachment'] as const),
    resourceType: null,
    entityId: mockNanoid(),
    organizationId: mockNanoid(),
    contextType: null,
    seq: faker.number.int({ min: 1, max: 1000 }),
    // Generate cacheToken BEFORE stx to ensure deterministic output
    // (stx uses nested withFakerSeed which resets the seed after)
    cacheToken: faker.string.alphanumeric(32),
    stx: mockStxBase(`${key}:stx`),
  }));
