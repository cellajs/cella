import { createMockPinoModule } from 'shared/testing/pino';
import { vi } from 'vitest';

// Mocks pino so env.ts is not parsed at import time; applied to every CDC test via setupFiles.
vi.doMock('../lib/pino', () => createMockPinoModule(() => vi.fn()));
