import fs, { promises as fsp } from 'node:fs';
import path from 'node:path';
import type { HmrContext, ModuleNode, Plugin } from 'vite';

/**
 * Vite plugin for i18next locale file Hot Module Replacement (HMR).
 *
 * This plugin watches locale files (JSON/YAML) in the source directory and:
 * 1. Syncs them to a cache directory for faster access
 * 2. Merges specified namespaces into a target namespace (e.g., 'app' → 'common')
 * 3. Sends custom HMR events to trigger i18next reloads without full page refresh
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { localesHMR } from './vite/locales-hmr';
 *
 * export default {
 *   plugins: [
 *     localesHMR({
 *       srcDir: '../locales',
 *       outDir: '../.vscode/.locales-cache',
 *       merge: { target: 'common', sources: ['app'] },
 *     }),
 *   ],
 * };
 * ```
 */

/** Custom HMR event name sent to the client when locale files change */
const CUSTOM_EVENT = 'i18next-hmr:update' as const;

/** Configuration options for the LocalesHMR plugin */
export interface LocalesHMROptions {
  /** Source directory containing locale files (default: ../locales) */
  srcDir?: string;
  /** Output cache directory for processed locales (default: ../.vscode/.locales-cache) */
  outDir?: string;
  /** Namespace merge configuration - merges source namespaces into target */
  merge?: {
    /** Target namespace to merge into (e.g., 'common') */
    target: string;
    /** Source namespaces to merge from (e.g., ['app']) */
    sources: string[];
  };
  /** Enable verbose logging (default: true) */
  verbose?: boolean;
}

/**
 * Resolve user options with defaults.
 */
function resolveOptions(userOptions: LocalesHMROptions = {}): Required<LocalesHMROptions> {
  return {
    srcDir: userOptions.srcDir ?? path.resolve(process.cwd(), '../locales'),
    outDir: userOptions.outDir ?? path.resolve(process.cwd(), '../.vscode/.locales-cache'),
    merge: userOptions.merge ?? { target: 'common', sources: ['app'] },
    verbose: userOptions.verbose ?? true,
  };
}

/**
 * Conditional logger that respects verbose setting.
 */
function log(level: 'info' | 'warn' | 'error', message: string, verbose: boolean, ...args: unknown[]) {
  if (!verbose && level === 'info') return;
  const prefix = '[locales-hmr]';
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

/**
 * Check if a file path is a locale asset (JSON/YAML in a locales directory).
 */
function isLocaleAsset(file: string, srcDir: string): boolean {
  const rel = path.relative(srcDir, file);
  // File must be inside srcDir (not outside or absolute)
  if (rel.startsWith('..') || path.isAbsolute(rel)) return false;

  const posix = file.split(path.sep).join(path.posix.sep);
  return /(?:^|\/)locales\/.+\.(?:json|ya?ml)$/i.test(posix);
}

/**
 * Read a JSON file, returning empty object if it doesn't exist.
 */
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

/**
 * Sync a single language directory to the cache.
 *
 * This function:
 * 1. Reads all JSON namespace files from the source language directory
 * 2. Merges configured source namespaces into the target namespace
 * 3. Copies non-merged namespaces as-is to the output directory
 *
 * @param lang - Language code (e.g., 'en', 'nl')
 * @param options - Resolved plugin options
 */
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

  // Read all namespace JSON files into memory
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

  // Merge source namespaces into target namespace
  const targetNs = merge.target;
  const sourceNamespaces = new Set(merge.sources);

  const targetBase = resources[targetNs] ?? {};
  const mergedTarget: Record<string, unknown> = { ...targetBase };

  for (const ns of merge.sources) {
    Object.assign(mergedTarget, resources[ns] ?? {});
  }

  // Write merged target namespace
  if (Object.keys(mergedTarget).length > 0) {
    const commonOut = path.join(outLangDir, `${targetNs}.json`);
    await fsp.writeFile(commonOut, JSON.stringify(mergedTarget, null, 2), 'utf8');
    log('info', `wrote merged ${targetNs}.json for "${lang}" → ${commonOut}`, verbose);
  }

  // Copy remaining namespaces (those not merged) as-is
  await Promise.all(
    Object.entries(resources).map(async ([ns, data]) => {
      // Skip target (already written) and source namespaces (merged into target)
      if (ns === targetNs) return;
      if (sourceNamespaces.has(ns)) return;

      const outFile = path.join(outLangDir, `${ns}.json`);
      await fsp.writeFile(outFile, JSON.stringify(data, null, 2), 'utf8');
      log('info', `copied ${lang}/${ns}.json → ${outFile}`, verbose);
    }),
  );
}

/**
 * Sync all language directories to the cache.
 * Processes each language in parallel for faster startup.
 */
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

/**
 * Build the locales cache on-demand.
 * Can be called outside of Vite (e.g., in build scripts).
 */
export async function buildLocalesCache(userOptions: LocalesHMROptions = {}) {
  const options = resolveOptions(userOptions);
  await syncAllLanguages(options);
}

/**
 * Vite plugin for i18next locale file Hot Module Replacement.
 *
 * Features:
 * - Watches locale files for changes during development
 * - Syncs changes to a cache directory for faster loading
 * - Sends custom HMR events instead of triggering full page reload
 * - Merges specified namespaces for convenience
 *
 * Client-side integration required:
 * ```ts
 * if (import.meta.hot) {
 *   import.meta.hot.on('i18next-hmr:update', () => {
 *     i18n.reloadResources();
 *   });
 * }
 * ```
 */
export function localesHMR(userOptions: LocalesHMROptions = {}): Plugin {
  const options = resolveOptions(userOptions);

  return {
    name: 'locales-hmr',
    apply: 'serve',
    enforce: 'post',

    /** Build initial cache when dev server starts */
    async configureServer() {
      await buildLocalesCache(options);
    },

    /**
     * Handle locale file changes.
     * Returns empty array to prevent Vite's default full-reload behavior.
     */
    async handleHotUpdate(ctx: HmrContext): Promise<ModuleNode[] | void> {
      if (!isLocaleAsset(ctx.file, options.srcDir)) return;

      // Send custom event to client for i18next to handle
      ctx.server.ws.send({
        type: 'custom',
        event: CUSTOM_EVENT,
        data: { file: ctx.file },
      });

      log('info', `locale file changed: ${path.relative(options.srcDir, ctx.file)}`, options.verbose);

      // Sync only the affected language to the cache
      try {
        const rel = path.relative(options.srcDir, ctx.file);
        const [lang] = rel.split(path.sep);

        if (lang) {
          await syncLanguage(lang, options);
        }
      } catch (err) {
        log('error', 'failed to sync locale cache', options.verbose, err);
      }

      // Return empty array to prevent full page reload
      return [];
    },
  };
}
