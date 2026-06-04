import { faker } from '@faker-js/faker';
import { actionToVerb, activityActions, appConfig } from 'shared';
import type { ActivityModel } from '#/db/schema/activities';
import { entityTableNames } from '#/tables';
import {
  generateMockContextEntityIdColumns,
  MOCK_REF_DATE,
  mockPaginated,
  mockTenantId,
  mockUuid,
  withFakerSeed,
} from './utils';

/**
 * Generates a mock activity with all fields populated. Currently hardcoded
 * with entityType values but true schema also includes resourceType values.
 * It should always be oneOf: entityType or resourceType populated with their respective values.
 * Uses deterministic seeding - same key produces same data.
 * Context entity ID columns are generated dynamically based on relatable context entity types.
 * Used for DB seeding, tests, and API response examples.
 */
export const mockActivity = (key = 'activity:default', overrides?: Partial<ActivityModel>): ActivityModel =>
  withFakerSeed(key, () => {
    const refDate = MOCK_REF_DATE;
    const createdAt = faker.date.past({ refDate }).toISOString();
    const tableName = faker.helpers.arrayElement(entityTableNames);
    const action = faker.helpers.arrayElement([...activityActions]);
    const trackedType = faker.helpers.arrayElement([...appConfig.entityTypes, ...appConfig.resourceTypes]);
    const verb = actionToVerb(action);

    return {
      id: mockUuid(),
      tenantId: mockTenantId(),
      userId: mockUuid(),
      entityType: faker.helpers.arrayElement([...appConfig.entityTypes, null]),
      resourceType: null,
      action,
      tableName,
      type: `${trackedType}.${verb}`,
      subjectId: mockUuid(),
      createdAt,
      changedFields:
        action === 'update'
          ? faker.helpers.arrayElements(['name', 'email', 'slug', 'description'], { min: 2, max: 4 })
          : null,
      stx: null,
      ...generateMockContextEntityIdColumns('relatable'),
      ...overrides,
    };
  });

/** Alias for API response examples (activity schema matches DB schema) */
export const mockActivityResponse = mockActivity;

/**
 * Generates a paginated mock activity list response for getActivities endpoint.
 */
export const mockPaginatedActivitiesResponse = (count = 2) => mockPaginated(mockActivityResponse, count);
