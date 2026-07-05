import { vi } from 'vitest';

// Mock pino to avoid env.ts parsing at import time.
// Applied to all CDC test files via vitest setupFiles.
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
