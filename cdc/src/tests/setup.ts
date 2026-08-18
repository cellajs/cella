import { vi } from 'vitest';

// Mocks pino so env.ts is not parsed at import time; applied to every CDC test via setupFiles.
vi.mock('../lib/pino', () => ({
  log: {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
  },
}));
