import { mockUuid } from '#/mocks/mock-ids';
import type { StxBase } from '#/schemas/sync-transaction-schemas';

export const mockStx = (): StxBase => ({ mutationId: mockUuid(), sourceId: mockUuid(), fieldTimestamps: {} });
