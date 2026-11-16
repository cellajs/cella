import 'fake-indexeddb/auto';
import { appConfig } from 'shared';
import { expect, it } from 'vitest';
import { stubLocalStorage } from '~/query/tests/query-client-env';

stubLocalStorage();

const sources = import.meta.glob<string>(['../../**/*.{ts,tsx}', '!../../**/*.test.{ts,tsx}', '!../../**/tests/**'], {
  query: '?raw',
  import: 'default',
  eager: true,
});
const modules = import.meta.glob<Record<string, unknown>>(['../../**/*.{ts,tsx}', '!../../**/*.test.{ts,tsx}', '!../../**/tests/**']);

type PersistedStore = { persist: { getOptions: () => { name?: string } } };
const isPersisted = (value: unknown): value is PersistedStore =>
  (typeof value === 'function' || typeof value === 'object') && !!value && 'persist' in value;

// What a session end and the dev reset clear is known only through these two rules: a store that breaks one outlives
// the user it belongs to.
it("must give every persisted store a lifetime: a localStorage one carries the app's prefix, a per-user one is listed", async () => {
  const kvKeys = Object.values(sources).flatMap((source) => [...source.matchAll(/idbKvStorage\('([\w-]+)'/g)].map(([, key]) => key));
  const { localUserStores } = await import('~/query/local-user-storage');
  const listed = (localUserStores as unknown as PersistedStore[]).map((store) => store.persist.getOptions().name);
  expect(new Set(kvKeys)).toEqual(new Set(listed));

  const localStorageModules = Object.keys(sources).filter((path) => sources[path].includes('createJSONStorage(() => localStorage)'));
  expect(localStorageModules.length).toBeGreaterThan(0);
  for (const path of localStorageModules) {
    for (const store of Object.values(await modules[path]()).filter(isPersisted)) {
      expect(store.persist.getOptions().name, path).toMatch(new RegExp(`^${appConfig.slug}-`));
    }
  }
});
