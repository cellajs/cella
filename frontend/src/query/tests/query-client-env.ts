import { vi } from 'vitest';

// A test of the query layer imports this before query-client.ts, which wires the online listeners and reads
// navigator.onLine when it loads. The client's cache callbacks lazy-import on-error and on-success; neither is under test.
vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
vi.stubGlobal('navigator', { onLine: true });
vi.mock('~/query/on-error', () => ({ onError: vi.fn() }));
vi.mock('~/query/on-success', () => ({ onSuccess: vi.fn() }));

/** An empty storage for a module that reads `localStorage` itself; node tests run without one. */
export function stubLocalStorage(): void {
  vi.stubGlobal('localStorage', {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
    key: vi.fn(() => null),
    length: 0,
  });
}
