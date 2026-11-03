import { promises as fsp } from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

interface LocalesCacheOptions {
  /** Source directory holding `<lng>/<ns>.json` files. */
  srcDir: string;
  /** Cache directory i18n Ally reads (locales/README.md). */
  outDir: string;
  /** Namespace merge: `sources` combined into `target`, a later source's keys winning. */
  merge: { target: string; sources: string[] };
}

/**
 * Writes the i18n Ally cache in dev: each language's namespaces with the merge applied, since no raw file maps to the
 * merged namespace. The app itself bundles and lazy-loads locales as modules (lib/i18n-locales.ts); this serves the editor.
 */
export function localesPlugin({ srcDir, outDir, merge }: LocalesCacheOptions): Plugin {
  const syncLanguage = async (language: string) => {
    const sourceDir = path.join(srcDir, language);
    const entries = await fsp.readdir(sourceDir, { withFileTypes: true }).catch(() => []);
    const names = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.json')).map((entry) => entry.name);
    const resources = new Map(
      await Promise.all(
        names.map(async (name) => [path.basename(name, '.json'), JSON.parse(await fsp.readFile(path.join(sourceDir, name), 'utf8'))] as const),
      ),
    );
    const merged = Object.assign({}, ...merge.sources.map((source) => resources.get(source) ?? {}));
    await fsp.mkdir(path.join(outDir, language), { recursive: true });
    const writes = [...resources].filter(([namespace]) => namespace !== merge.target && !merge.sources.includes(namespace));
    await Promise.all(
      [...writes, [merge.target, merged] as const].map(([namespace, data]) =>
        fsp.writeFile(path.join(outDir, language, `${namespace}.json`), JSON.stringify(data, null, 2), 'utf8'),
      ),
    );
  };

  const build = async () => {
    await fsp.rm(outDir, { recursive: true, force: true });
    const entries = await fsp.readdir(srcDir, { withFileTypes: true }).catch(() => []);
    await Promise.all(entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith('.')).map((entry) => syncLanguage(entry.name)));
  };

  return {
    name: 'locales',
    apply: 'serve',
    async configureServer(server) {
      await build();
      server.watcher.add(srcDir);
      server.watcher.on('change', (file) => {
        const relative = path.relative(srcDir, file);
        if (relative.startsWith('..') || !relative.endsWith('.json')) return;
        syncLanguage(relative.split(path.sep)[0]).catch((error) => console.error('[locales] cache sync failed', error));
      });
    },
  };
}
