import { faker } from '@faker-js/faker';
import { mockNanoid, mockUuid, withFakerSeed } from '#/mocks';
import { mockStxBase } from '#/schemas/sync-transaction-mocks';

/** An edit of one product row: its seq and the stx of the write. */
export const mockStreamChange = (key = 'stream-change:default') =>
  withFakerSeed(key, () => {
    const organizationId = mockUuid();
    return {
      action: 'update' as const,
      productType: 'attachment' as const,
      organizationId,
      tenantId: mockNanoid(),
      channelId: mockUuid(),
      rows: [{ subjectId: mockUuid(), seq: faker.number.int({ min: 1, max: 500 }), stx: mockStxBase(`${key}:stx`), actorId: mockUuid() }],
      overflow: null,
      spreadWindow: null,
      propagation: null,
    };
  });

/** The user's own membership changed: an ephemeral signal to one user. */
export const mockStreamSignal = (key = 'stream-signal:default') =>
  withFakerSeed(key, () => ({ type: 'membership.changed', organizationId: mockUuid(), subjectId: mockUuid() }));

/** A session sign-in replaced: the client reconnects with the newer session. */
export const mockStreamError = () => ({ code: 'session_replaced' as const, message: 'Session replaced' });
