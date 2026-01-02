import fs, { promises as fsp } from 'node:fs';
import path from 'node:path';
import type { HmrContext, ModuleNode, Plugin } from 'vite';

const CUSTOM_EVENT = 'i18next-hmr:update' as const;

export interface LocalesHMROptions {
  srcDir?: string;
  outDir?: string;
  merge?: {
    target: string;
    sources: string[];
  };
  verbose?: boolean;
}

function resolveOptions(userOptions: LocalesHMROptions = {}): Required<LocalesHMROptions> {
  return {
    srcDir: userOptions.srcDir ?? path.resolve(process.cwd(), '../locales'),
    outDir: userOptions.outDir ?? path.resolve(process.cwd(), '../.vscode/.locales-cache'),
    merge: userOptions.merge ?? { target: 'common', sources: ['app'] },
    verbose: userOptions.verbose ?? true,
  };
}

function log(level: 'info' | 'warn' | 'error', message: string, verbose: boolean, ...args: unknown[]) {
  if (!verbose && level === 'info') return;
  const prefix = 'LocalesHMR:';
  switch (level) {
    case 'info':
      console.info(prefix, message, ...args);
      break;
    case 'warn':
      console.warn(prefix, message, ...args);
      break;
    case 'error':
      console.error(prefix, message, ...args);
      break;
  }
}

function isLocaleAsset(file: string, srcDir: string): boolean {
  const rel = path.relative(srcDir, file);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return false;

  const posix = file.split(path.sep).join(path.posix.sep);
  return /(?:^|\/)locales\/.+\.(?:json|ya?ml)$/i.test(posix);
}

async function readJsonIfExists(file: string): Promise<Record<string, unknown>> {
  try {
    const content = await fsp.readFile(file, 'utf8');
    return JSON.parse(content) as Record<string, unknown>;
  } catch (err: any) {
    if (err && (err.code === 'ENOENT' || err.code === 'ENOTDIR')) {
      return {};
    }
    throw err;
  }
}

async function syncLanguage(lang: string, options: Required<LocalesHMROptions>): Promise<void> {
  const { srcDir, outDir, merge, verbose } = options;
  const srcLangDir = path.join(srcDir, lang);

  if (!fs.existsSync(srcLangDir)) {
    log('warn', `language dir "${srcLangDir}" does not exist, skipping`, verbose);
    return;
  }

  const outLangDir = path.join(outDir, lang);
  await fsp.mkdir(outLangDir, { recursive: true });

  const entries = await fsp.readdir(srcLangDir, { withFileTypes: true });

  const resources: Record<string, Record<string, unknown>> = {};

  await Promise.all(
    entries
      .filter((e) => e.isFile() && e.name.endsWith('.json'))
      .map(async (e) => {
        const ns = path.basename(e.name, '.json');
        const srcFile = path.join(srcLangDir, e.name);
        resources[ns] = await readJsonIfExists(srcFile);
      }),
  );

  const targetNs = merge.target;
  const sourceNamespaces = new Set(merge.sources);

  const targetBase = resources[targetNs] ?? {};
  const mergedTarget: Record<string, unknown> = { ...targetBase };

  for (const ns of merge.sources) {
    Object.assign(mergedTarget, resources[ns] ?? {});
  }

  if (Object.keys(mergedTarget).length > 0) {
    const commonOut = path.join(outLangDir, `${targetNs}.json`);
    await fsp.writeFile(commonOut, JSON.stringify(mergedTarget, null, 2), 'utf8');
    log('info', `wrote merged ${targetNs}.json for "${lang}" → ${commonOut}`, verbose);
  }

  await Promise.all(
    Object.entries(resources).map(async ([ns, data]) => {
      if (ns === targetNs) return;
      if (sourceNamespaces.has(ns)) return;

      const outFile = path.join(outLangDir, `${ns}.json`);
      await fsp.writeFile(outFile, JSON.stringify(data, null, 2), 'utf8');
      log('info', `copied ${lang}/${ns}.json → ${outFile}`, verbose);
    }),
  );
}

async function syncAllLanguages(options: Required<LocalesHMROptions>): Promise<void> {
  const { srcDir, verbose } = options;

  if (!fs.existsSync(srcDir)) {
    log('warn', `source dir not found: ${srcDir}`, verbose);
    return;
  }

  // Read all language directories, ignore cache itself
  const entries = await fsp.readdir(srcDir, { withFileTypes: true });
  const langs = entries.filter((d) => d.isDirectory() && !d.name.startsWith('.')).map((d) => d.name);

  await Promise.all(langs.map((lang) => syncLanguage(lang, options)));
}

// Build the locales cache initially
export async function buildLocalesCache(userOptions: LocalesHMROptions = {}) {
  const options = resolveOptions(userOptions);
  await syncAllLanguages(options);
}

// Vite plugin for HMR of locale files
export function localesHMR(userOptions: LocalesHMROptions = {}): Plugin {
  const options = resolveOptions(userOptions);

  return {
    name: 'locales-hmr',
    apply: 'serve',
    enforce: 'post',

    async configureServer() {
      await buildLocalesCache(options);
    },

    async handleHotUpdate(ctx: HmrContext): Promise<ModuleNode[] | void> {
      if (!isLocaleAsset(ctx.file, options.srcDir)) return;

      ctx.server.ws.send({
        type: 'custom',
        event: CUSTOM_EVENT,
        data: { file: ctx.file },
      });

      log('info', `locale file changed, prevent full reload: ${ctx.file}`, options.verbose);

      // Sync the changed language into the cache
      // This could be optimized to only update affected files
      try {
        const rel = path.relative(options.srcDir, ctx.file);
        const [lang] = rel.split(path.sep);

        if (lang) {
          void syncLanguage(lang, options).catch((err) => {
            log('error', 'error while syncing locales for cache', options.verbose, err);
          });
        }
      } catch (err) {
        log('error', 'error while syncing locales on HMR', options.verbose, err);
      }

      return [];
    },
  };
}
