import { vi } from 'vitest';

// Silence noisy test console output (query debug logs, zustand persist warnings, info
// breadcrumbs). console.error is left intact so real problems still surface in CI.
console.info = vi.fn();
console.debug = vi.fn();
console.log = vi.fn();
console.warn = vi.fn();
