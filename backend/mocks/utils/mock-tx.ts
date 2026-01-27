import type { TxColumnData } from '#/db/utils/tx-columns';
import { mockNanoid } from './mock-nanoid';

/**
 * Generates mock transaction metadata for offline/realtime entities.
 * Uses faker's seeded RNG for deterministic output.
 */
export const mockTx = (): TxColumnData => ({
  id: mockNanoid(),
  sourceId: `src_${mockNanoid()}`,
  version: 1,
  fieldVersions: {},
});
