import { faker } from '@faker-js/faker';
import { appConfig } from 'shared';
import type { ActivityModel } from '#/db/schema/activities';
import { activityActions } from '#/sync/activity-bus';
import { entityTableNames } from '#/table-config';
import { generateMockContextEntityIdColumns, mockNanoid, mockPaginated, withFakerSeed } from './utils';

/**
 * Generates a mock activity with all fields populated. Currently hardcoded
 * with entityType values but true schema also includes resourceType values.
 * It should always be oneOf: entityType or resourceType populated with their respective values.
 * Uses deterministic seeding - same key produces same data.
 * Context entity ID columns are generated dynamically based on relatable context entity types.
 * Used for DB seeding, tests, and API response examples.
 */
export const mockActivity = (key = 'activity:default'): ActivityModel =>
  withFakerSeed(key, () => {
    const refDate = new Date('2025-01-01T00:00:00.000Z');
    const createdAt = faker.date.past({ refDate }).toISOString();
    const tableName = faker.helpers.arrayElement(entityTableNames);
    const action = faker.helpers.arrayElement([...activityActions]);
    const singularName = tableName.replace(/s$/, '');
    const verb = action === 'create' ? 'created' : action === 'update' ? 'updated' : 'deleted';

    return {
      id: mockNanoid(),
      userId: mockNanoid(),
      entityType: faker.helpers.arrayElement([...appConfig.entityTypes, null]),
      resourceType: null,
      action,
      tableName,
      type: `${singularName}.${verb}`,
      entityId: mockNanoid(),
      createdAt,
      changedKeys:
        action === 'update'
          ? faker.helpers.arrayElements(['name', 'email', 'slug', 'description'], { min: 2, max: 4 })
          : null,
      tx: null,
      seq: faker.number.int({ min: 1, max: 1000 }),
      // Dead letter error info (null for successfully processed activities)
      error: null,
      ...generateMockContextEntityIdColumns('relatable'),
    };
  });

/** Alias for API response examples (activity schema matches DB schema) */
export const mockActivityResponse = mockActivity;

/**
 * Generates a paginated mock activity list response for getActivities endpoint.
 */
export const mockPaginatedActivitiesResponse = (count = 2) => mockPaginated(mockActivityResponse, count);
