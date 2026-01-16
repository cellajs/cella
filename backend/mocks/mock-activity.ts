import { faker } from '@faker-js/faker';
import type { ActivityModel } from '#/db/schema/activities';
import { mockNanoid, withFakerSeed } from './utils';

/**
 * Generates a mock activity with all fields populated.
 * Uses deterministic seeding - same key produces same data.
 * Used for DB seeding, tests, and API response examples.
 */
export const mockActivity = (key = 'activity:default'): ActivityModel =>
  withFakerSeed(key, () => {
    const refDate = new Date('2025-01-01T00:00:00.000Z');
    const createdAt = faker.date.past({ refDate }).toISOString();
    const tableName = faker.helpers.arrayElement(['users', 'organizations', 'attachments', 'memberships']);
    const action = faker.helpers.arrayElement(['create', 'update', 'delete']);
    const singularName = tableName.replace(/s$/, '');
    const verb = action === 'create' ? 'created' : action === 'update' ? 'updated' : 'deleted';

    return {
      id: mockNanoid(),
      userId: mockNanoid(),
      entityType: faker.helpers.arrayElement(['user', 'organization', 'attachment', null]),
      resourceType: null,
      action,
      tableName,
      type: `${singularName}.${verb}`,
      entityId: mockNanoid(),
      organizationId: mockNanoid(),
      createdAt,
      changedKeys:
        action === 'update'
          ? faker.helpers.arrayElements(['name', 'email', 'slug', 'description'], { min: 1, max: 3 })
          : null,
    };
  });

/** Alias for API response examples (activity schema matches DB schema) */
export const mockActivityResponse = mockActivity;
