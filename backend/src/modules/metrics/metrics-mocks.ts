import { faker } from '@faker-js/faker';
import { withFakerSeed } from '#/mocks';
import { publicCountTypes } from '#/modules/metrics/metrics-schema';

export const mockPublicCountsResponse = (key = 'metrics:public-counts') =>
  withFakerSeed(key, () => Object.fromEntries(publicCountTypes.map((type) => [type, faker.number.int({ min: 0, max: 500 })])));
