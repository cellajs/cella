import { faker } from '@faker-js/faker';
import { mockNanoid, mockUuid, withFakerSeed } from '#/mocks';
import { mockStxBase } from './sync-transaction-mocks';

/**
 * Generates a mock StreamNotification example for product entity events.
 *
 * For product entities (e.g. attachment):
 * - entityType is set, resourceType is null
 * - Includes stx, seq for sync engine
 * - channelType is null (not a channel entity event)
 */
export const mockStreamNotification = (key = 'stream-notification:default') =>
  withFakerSeed(key, () => ({
    kind: 'entity' as const,
    action: faker.helpers.arrayElement(['create', 'update', 'delete'] as const),
    entityType: 'attachment' as const,
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
