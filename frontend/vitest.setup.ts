import { vi } from 'vitest';

// Silence noisy console output during tests (e.g. QueryPersister debug logs,
// zustand persist warnings, info breadcrumbs). Errors remain visible so real
// problems still surface in CI output.
console.info = vi.fn();
console.debug = vi.fn();
console.log = vi.fn();
console.warn = vi.fn();
