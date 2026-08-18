import { vi } from 'vitest';

// Rate-limiter mock, applied via vitest setupFiles in core/full test modes.
vi.mock('#/middlewares/rate-limiter/core', async () => (await import('./test-utils')).rateLimiterCoreMock());
vi.mock('#/middlewares/rate-limiter/helpers', async (importOriginal) =>
  (await import('./test-utils')).rateLimiterHelpersMock(importOriginal),
);
