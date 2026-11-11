import { vi } from 'vitest';

// A test of the query layer imports this before query-client.ts, which wires the online listeners and reads
// navigator.onLine when it loads. The client's cache callbacks lazy-import on-error, which is not under test.
// `setTimeout` reads the global at call time, so fake timers drive the idle fallback of `scheduleIdle`.
vi.stubGlobal('window', {
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  setTimeout: (callback: () => void, ms?: number) => setTimeout(callback, ms),
});
// Base UI's toast module lowercases navigator.userAgent when it loads, so the stub carries one.
vi.stubGlobal('navigator', { onLine: true, userAgent: '' });
vi.mock('~/query/on-error', () => ({ onError: vi.fn() }));

/** An in-memory storage for a module that reads `localStorage` itself, as the user store does to persist; node tests run without one. */
export function stubLocalStorage(): void {
  const items = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  });
}
