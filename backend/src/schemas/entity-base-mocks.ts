import { faker } from '@faker-js/faker';
import { mockNanoid, mockTimestamps, mockUuid, withFakerSeed } from '#/mocks';

/** Must be called within withFakerSeed() for deterministic output. */
const mockEntityCore = () => ({ id: mockUuid(), ...mockTimestamps() });

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

export const mockProductBase = (key = 'product-entity:default') =>
  withFakerSeed(key, () => ({
    ...mockEntityCore(),
    name: faker.lorem.sentence({ min: 2, max: 5 }),
    description: faker.lorem.paragraph(),
    keywords: faker.lorem.words(3),
    entityType: 'attachment' as const,
  }));

/** The reference of a user who wrote a row. */
export const mockActorRef = (key = 'actor-ref:default', id?: string) =>
  withFakerSeed(key, () => {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    return {
      id: id ?? mockUuid(),
      kind: 'user' as const,
      name: `${firstName} ${lastName}`,
      slug: faker.internet.username({ firstName, lastName }).toLowerCase(),
      thumbnailUrl: null,
    };
  });

/** Resolves the stored writer ids of a row to the references its response carries. */
export const mockActorRefs = (row: { createdBy: string | null; updatedBy: string | null }, key: string) => {
  const createdBy = row.createdBy ? mockActorRef(`${key}:created-by`, row.createdBy) : null;
  const updatedBy = row.updatedBy === row.createdBy ? createdBy : row.updatedBy ? mockActorRef(`${key}:updated-by`, row.updatedBy) : null;
  return { createdBy, updatedBy };
};

/** Only the name and slug generation differs per entity type. Must be called within withFakerSeed(). */
const mockMinimalBase = <T extends string>(entityType: T, naming: () => { name: string; slug: string }, id?: string) => ({
  id: id ?? mockUuid(),
  ...naming(),
  thumbnailUrl: null,
  entityType,
});

export const mockUserMinimalBase = (key = 'user-minimal:default', id?: string) =>
  withFakerSeed(key, () =>
    mockMinimalBase(
      'user' as const,
      () => {
        const firstName = faker.person.firstName();
        const lastName = faker.person.lastName();
        return { name: `${firstName} ${lastName}`, slug: faker.internet.username({ firstName, lastName }).toLowerCase() };
      },
      id,
    ),
  );

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
