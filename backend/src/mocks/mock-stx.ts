import type { StxBase } from '#/schemas/sync-transaction-schemas';
import { mockUuid } from './mock-nanoid';

export const mockStx = (): StxBase => ({
  mutationId: mockUuid(),
  sourceId: mockUuid(),
  fieldTimestamps: {},
});
