import { faker } from '@faker-js/faker';
import { mockNanoid, mockUuid, withFakerSeed } from '#/mocks';
import { mockStxBase } from './sync-transaction-mocks';

/** Product-entity shape: productType set, resourceType and channelType null, stx and seq present, one row (count null). */
export const mockStreamNotification = (key = 'stream-notification:default') =>
  withFakerSeed(key, () => {
    const action = faker.helpers.arrayElement(['create', 'update', 'delete'] as const);
    const subjectId = mockUuid();
    const organizationId = mockUuid();
    return {
      kind: 'product' as const,
      action,
      productType: 'attachment' as const,
      resourceType: null,
      subjectId,
      organizationId,
      tenantId: mockNanoid(),
      channelType: null,
      // An attachment's path is its organization id.
      path: organizationId,
      channelId: mockUuid(),
      seq: faker.number.int({ min: 1, max: 500 }),
      stx: mockStxBase(`${key}:stx`),
      batchUntilSeq: null,
      count: null,
      spreadWindow: null,
      propagation: null,
    };
  });
