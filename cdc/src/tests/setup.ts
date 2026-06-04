import { vi } from 'vitest';

// Mock pino to avoid env.ts parsing at import time.
// Applied to all CDC test files via vitest setupFiles.
vi.mock('../lib/pino', () => ({
  logEvent: vi.fn(),
  logError: vi.fn(),
}));
