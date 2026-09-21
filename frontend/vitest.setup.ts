import { vi } from 'vitest';

// Silence noisy test console output (query debug logs, zustand persist warnings, info
// breadcrumbs). console.error is left intact so real problems still surface in CI.
console.info = vi.fn();
console.debug = vi.fn();
console.log = vi.fn();
console.warn = vi.fn();

// Node 25+ defines a global `localStorage` that is undefined without --localstorage-file,
// and zustand persist crashes on write against it. Node-env tests drop the global so persist
// stays disabled; jsdom tests keep the storage jsdom provides.
if (typeof window === 'undefined') delete (globalThis as { localStorage?: unknown }).localStorage;
