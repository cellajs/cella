import { faker } from '@faker-js/faker';
import { mockNanoid, mockUuid, withFakerSeed } from '#/mocks';
import { mockStxBase } from './sync-transaction-mocks';

/** Product-entity shape: productType set, resourceType and channelType null, stx and seq present. */
export const mockStreamNotification = (key = 'stream-notification:default') =>
  withFakerSeed(key, () => ({
    kind: 'product' as const,
    action: faker.helpers.arrayElement(['create', 'update', 'delete'] as const),
    productType: 'attachment' as const,
    resourceType: null,
    subjectId: mockUuid(),
    organizationId: mockUuid(),
    tenantId: mockNanoid(),
    channelType: null,
    channelId: mockUuid(),
    seq: faker.number.int({ min: 1, max: 500 }),
    stx: mockStxBase(`${key}:stx`),
    batchUntilSeq: null,
    spreadWindow: null,
    propagation: null,
  }));
