import { faker } from '@faker-js/faker';
import { mockNanoid, mockUuid, withFakerSeed } from '#/mocks';
import { mockStxBase } from '#/schemas/sync-transaction-mocks';

/** One product row: stx and seq present, count null. */
export const mockStreamChange = (key = 'stream-change:default') =>
  withFakerSeed(key, () => {
    const action = faker.helpers.arrayElement(['create', 'update', 'delete'] as const);
    const subjectId = mockUuid();
    const organizationId = mockUuid();
    return {
      action,
      productType: 'attachment' as const,
      subjectId,
      organizationId,
      tenantId: mockNanoid(),
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

/** The user's own membership changed: an ephemeral signal to one user, version unknown to the sender. */
export const mockStreamSignal = (key = 'stream-signal:default') =>
  withFakerSeed(key, () => ({
    type: 'membership.changed',
    organizationId: mockUuid(),
    subjectId: mockUuid(),
    version: null,
  }));
