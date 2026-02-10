import type { StxBase } from '#/schemas/stx-base-schema';
import { mockNanoid } from './mock-nanoid';

/**
 * Generates mock sync transaction metadata for offline/realtime entities.
 * Uses faker's seeded RNG for deterministic output.
 */
export const mockStx = (): StxBase => ({
  id: mockNanoid(),
  sourceId: `src_${mockNanoid()}`,
  version: 1,
  fieldVersions: {},
});
