import { faker } from '@faker-js/faker';
import { getTableName } from 'drizzle-orm';
import { actionToVerb, activityActions, appConfig } from 'shared';
import {
  generateMockActivityChannelIdColumns,
  mockPaginated,
  mockPastIsoDate,
  mockTenantId,
  mockUuid,
  withFakerSeed,
} from '#/mocks';
import type { ActivityModel } from '#/modules/activities/activities-db';
import { getEntityTable } from '#/tables';

/** Deterministic per `key`. Schema is oneOf `entityType`/`resourceType`; this mock hardcodes `entityType`. */
export const mockActivity = (key = 'activity:default', overrides?: Partial<ActivityModel>): ActivityModel =>
  withFakerSeed(key, () => {
    const createdAt = mockPastIsoDate();
    const entityType = faker.helpers.arrayElement(appConfig.entityTypes);
    const tableName = getTableName(getEntityTable(entityType));
    const action = faker.helpers.arrayElement([...activityActions]);
    const verb = actionToVerb(action);

    return {
      id: mockUuid(),
      tenantId: mockTenantId(),
      userId: mockUuid(),
      entityType,
      resourceType: null,
      action,
      tableName,
      type: `${entityType}.${verb}`,
      subjectId: mockUuid(),
      createdAt,
      changedFields:
        action === 'update'
          ? faker.helpers.arrayElements(['name', 'email', 'slug', 'description'], { min: 2, max: 4 })
          : null,
      stx: null,
      ...generateMockActivityChannelIdColumns(),
      ...overrides,
    };
  });

export const mockActivityResponse = mockActivity;

export const mockPaginatedActivitiesResponse = (count = 2) => mockPaginated(mockActivityResponse, count);
