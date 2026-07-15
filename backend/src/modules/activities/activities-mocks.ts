import { faker } from '@faker-js/faker';
import { actionToVerb, activityActions, appConfig } from 'shared';
import {
  generateMockChannelIdColumns,
  MOCK_REF_DATE,
  mockPaginated,
  mockTenantId,
  mockUuid,
  withFakerSeed,
} from '#/mocks';
import type { ActivityModel } from '#/modules/activities/activities-db';
import { entityTableNames } from '#/tables';

/**
 * Mock activity with all fields populated (deterministic per `key`). Channel-entity ID columns are
 * generated dynamically. Schema is oneOf `entityType`/`resourceType`; this mock hardcodes `entityType`.
 * Used for DB seeding, tests, and API examples.
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
      ...generateMockChannelIdColumns('relatable'),
      ...overrides,
    };
  });

/** Alias for API response examples (activity schema matches DB schema) */
export const mockActivityResponse = mockActivity;

/**
 * Generates a paginated mock activity list response for getActivities endpoint.
 */
export const mockPaginatedActivitiesResponse = (count = 2) => mockPaginated(mockActivityResponse, count);
