import namespaces from '../../locales/namespaces.json' with { type: 'json' };

/** Runtime namespaces read from several locale files, merged in order so a later file's keys win. */
const mergedNamespaces: Record<string, string[]> = namespaces;

/** The locale files a runtime namespace reads: its own file, unless `shared/locales/namespaces.json` merges several. */
export const localeFilesOf = (namespace: string): string[] => mergedNamespaces[namespace] ?? [namespace];

/** One language's locale files, keyed by file name, as its runtime namespaces: `common` and `app` become `c`. */
export function toRuntimeNamespaces<T extends object>(files: Record<string, T>): Record<string, T> {
  const merged = new Set(Object.values(mergedNamespaces).flat());
  const runtime: Record<string, T> = {};
  for (const [file, resources] of Object.entries(files)) if (!merged.has(file)) runtime[file] = resources;
  for (const [namespace, sources] of Object.entries(mergedNamespaces)) {
    runtime[namespace] = Object.assign({}, ...sources.map((file) => files[file] ?? {}));
  }
  return runtime;
}
