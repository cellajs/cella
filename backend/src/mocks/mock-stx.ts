import type { StxBase } from '#/schemas/sync-transaction-schemas';
import { mockUuid } from './mock-nanoid';

/**
 * Generates mock sync transaction metadata for offline/realtime entities.
 * Uses faker's seeded RNG for deterministic output.
 */
export const mockStx = (): StxBase => ({
  mutationId: mockUuid(),
  sourceId: mockUuid(),
  fieldTimestamps: {},
});
