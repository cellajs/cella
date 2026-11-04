import { faker } from '@faker-js/faker';
import { recordFromKeys } from 'shared';
import { withFakerSeed } from '#/mocks';
import { publicCountTypes } from '#/modules/metrics/metrics-schema';

export const mockPublicCountsResponse = (key = 'metrics:public-counts') =>
  withFakerSeed(key, () => recordFromKeys(publicCountTypes, () => faker.number.int({ min: 0, max: 500 })));
