import { faker } from '@faker-js/faker';
import { appConfig, type EntityType } from 'shared';
import { withFakerSeed } from '#/mocks';

export const mockPublicCountsResponse = (key = 'metrics:public-counts') =>
  withFakerSeed(key, () => {
    const counts = Object.fromEntries(appConfig.entityTypes.map((entityType) => [entityType, faker.number.int({ min: 0, max: 500 })]));
    return counts as Record<EntityType, number>;
  });
