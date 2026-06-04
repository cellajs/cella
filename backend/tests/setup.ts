import { vi } from 'vitest';

// Mock rate limiter for all backend integration tests.
// Applied via vitest setupFiles for core/full test modes.
vi.mock('#/middlewares/rate-limiter/core', async () => (await import('./test-utils')).rateLimiterCoreMock());
vi.mock('#/middlewares/rate-limiter/helpers', async (importOriginal) =>
  (await import('./test-utils')).rateLimiterHelpersMock(importOriginal),
);
